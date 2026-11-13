// Package history is the memory of the cluster. Kubernetes keeps events for an
// hour and forgets a deleted object at once; Griot keeps the life story of
// every object, including an obituary after it is gone.
package history

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// Verbs of a record.
const (
	Born    = "born"
	Changed = "changed"
	Died    = "died"
)

// Ref identifies an object.
type Ref struct {
	Group     string `json:"group"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
}

func (r Ref) String() string {
	g := r.Group
	if g == "" {
		g = "core"
	}
	if r.Namespace == "" {
		return fmt.Sprintf("%s.%s/%s", r.Resource, g, r.Name)
	}
	return fmt.Sprintf("%s.%s/%s/%s", r.Resource, g, r.Namespace, r.Name)
}

// Record is one moment in an object's life.
type Record struct {
	ID       int64           `json:"id"`
	Ref      Ref             `json:"ref"`
	UID      string          `json:"uid"`
	Kind     string          `json:"kind"`
	Verb     string          `json:"verb"`
	At       time.Time       `json:"at"`
	Manager  string          `json:"manager,omitempty"` // field manager of the last write: who did it
	Revision string          `json:"resourceVersion"`
	Object   json.RawMessage `json:"object"`
}

// Store keeps records in SQLite.
type Store struct{ db *sql.DB }

// Open opens or creates the store.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grp TEXT NOT NULL, resource TEXT NOT NULL, namespace TEXT NOT NULL, name TEXT NOT NULL,
  uid TEXT NOT NULL, kind TEXT NOT NULL, verb TEXT NOT NULL, at INTEGER NOT NULL,
  manager TEXT NOT NULL, revision TEXT NOT NULL, hash TEXT NOT NULL, object BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS records_ref ON records(grp, resource, namespace, name, at);
CREATE INDEX IF NOT EXISTS records_verb ON records(verb, at);
CREATE INDEX IF NOT EXISTS records_uid ON records(uid, id);`)
	if err != nil {
		return nil, err
	}
	return &Store{db: db}, nil
}

// Close closes the store.
func (s *Store) Close() error { return s.db.Close() }

// LastHash returns the content hash of the latest record for the uid.
func (s *Store) LastHash(ctx context.Context, uid string) (hash, verb string, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT hash, verb FROM records WHERE uid=? ORDER BY id DESC LIMIT 1`, uid).Scan(&hash, &verb)
	if err == sql.ErrNoRows {
		return "", "", nil
	}
	return hash, verb, err
}

// Add appends a record.
func (s *Store) Add(ctx context.Context, r Record, hash string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO records(grp,resource,namespace,name,uid,kind,verb,at,manager,revision,hash,object) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
		r.Ref.Group, r.Ref.Resource, r.Ref.Namespace, r.Ref.Name, r.UID, r.Kind, r.Verb, r.At.UnixMilli(), r.Manager, r.Revision, hash, []byte(r.Object))
	return err
}

func scan(rows *sql.Rows) ([]Record, error) {
	defer rows.Close()
	var out []Record
	for rows.Next() {
		var r Record
		var at int64
		var obj []byte
		if err := rows.Scan(&r.ID, &r.Ref.Group, &r.Ref.Resource, &r.Ref.Namespace, &r.Ref.Name, &r.UID, &r.Kind, &r.Verb, &at, &r.Manager, &r.Revision, &obj); err != nil {
			return nil, err
		}
		r.At = time.UnixMilli(at).UTC()
		r.Object = obj
		out = append(out, r)
	}
	return out, rows.Err()
}

const cols = `id,grp,resource,namespace,name,uid,kind,verb,at,manager,revision,object`

// Life returns every record of an object (all its incarnations), oldest first.
func (s *Store) Life(ctx context.Context, ref Ref) ([]Record, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+cols+` FROM records WHERE grp=? AND resource=? AND namespace=? AND name=? ORDER BY id`,
		ref.Group, ref.Resource, ref.Namespace, ref.Name)
	if err != nil {
		return nil, err
	}
	return scan(rows)
}

// At returns the state of the object at time t: the latest record not after
// t. ok is false when the object did not exist then.
func (s *Store) At(ctx context.Context, ref Ref, t time.Time) (r Record, ok bool, err error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+cols+` FROM records WHERE grp=? AND resource=? AND namespace=? AND name=? AND at<=? ORDER BY id DESC LIMIT 1`,
		ref.Group, ref.Resource, ref.Namespace, ref.Name, t.UnixMilli())
	if err != nil {
		return r, false, err
	}
	rs, err := scan(rows)
	if err != nil || len(rs) == 0 {
		return r, false, err
	}
	return rs[0], true, nil
}

// LastAlive returns the last state before the object died, for restores
// without a time.
func (s *Store) LastAlive(ctx context.Context, ref Ref) (r Record, ok bool, err error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+cols+` FROM records WHERE grp=? AND resource=? AND namespace=? AND name=? ORDER BY id DESC LIMIT 1`,
		ref.Group, ref.Resource, ref.Namespace, ref.Name)
	if err != nil {
		return r, false, err
	}
	rs, err := scan(rows)
	if err != nil || len(rs) == 0 {
		return r, false, err
	}
	return rs[0], true, nil
}

// Obituaries lists deaths, newest first, optionally in one namespace.
func (s *Store) Obituaries(ctx context.Context, namespace string, limit int) ([]Record, error) {
	q := `SELECT ` + cols + ` FROM records WHERE verb='died'`
	args := []any{}
	if namespace != "" {
		q += ` AND namespace=?`
		args = append(args, namespace)
	}
	q += ` ORDER BY id DESC LIMIT ?`
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	return scan(rows)
}

// Prune forgets records older than the retention, except the last record of
// each object, so every object keeps at least its obituary.
func (s *Store) Prune(ctx context.Context, before time.Time) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM records WHERE at<? AND id NOT IN (SELECT MAX(id) FROM records GROUP BY uid)`, before.UnixMilli())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
