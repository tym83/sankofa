# Placeholder roots

Placeholder artists for building and testing the museum's Roots view and the
music map. build-data.sh uses them only when content/roots has no YAML. Every
claim, `what` and story starts with "[placeholder]"; the sources point at
outlets, not at checked articles. The real, double-checked collection lives in
content/roots. These files use `kind`, `what` and `story`, so they need the
pkg/roots that knows those fields.
