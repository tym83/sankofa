// The engine room: how the museum is a Kubernetes cluster. Every card is an
// object; the distribution's mechanics are named after the culture they come
// from, with one command each to try them.
import type { App } from '../app';
import { cardTable, cardYaml } from '../lib/cardYaml';
import { copyText, h, svgIcon, toast } from '../lib/dom';
import { count, pick, t } from '../lib/i18n';
import { readerCards } from '../lib/atlasModel';
import { readPath } from '../lib/reader';

interface Mechanism {
  name: string;
  culture: { en: string; ru: string };
  does: { en: string; ru: string };
  cmd: string;
  link?: { hash: string; en: string; ru: string };
}

const MECHANISMS: Mechanism[] = [
  {
    name: 'Griot',
    culture: {
      en: 'In West Africa a griot keeps the memory of families and kingdoms in speech and song.',
      ru: 'В Западной Африке гриот хранит память семей и царств в речи и песне.',
    },
    does: {
      en: 'Griot records the life of every object in the cluster and tells it back, even after the object is gone.',
      ru: 'Griot записывает жизнь каждого объекта в кластере и рассказывает её, даже когда объекта уже нет.',
    },
    cmd: 'sankofa tell deployment/web',
  },
  {
    name: 'Sankofa',
    culture: {
      en: 'An Adinkra symbol of the Akan: go back and fetch what you left behind.',
      ru: 'Символ адинкра у акан: вернись и забери то, что оставил.',
    },
    does: {
      en: 'Restores a deleted object from the cluster’s memory, as it was at a moment you choose.',
      ru: 'Возвращает удалённый объект из памяти кластера — таким, каким он был в выбранный момент.',
    },
    cmd: 'sankofa fetch deployment/web --at 2h',
  },
  {
    name: 'Kgotla',
    culture: {
      en: 'The Tswana council in Botswana: everyone speaks, and the chief speaks last.',
      ru: 'Совет у тсвана в Ботсване: высказываются все, а вождь говорит последним.',
    },
    does: {
      en: 'Before a protected object is deleted, a council is called; the deletion waits until every voice has spoken and the chief last.',
      ru: 'Прежде чем удалить защищённый объект, созывается совет; удаление ждёт, пока выскажутся все и последним — вождь.',
    },
    cmd: 'sankofa kgotla call namespace/archive',
  },
  {
    name: 'Polyrhythm',
    culture: {
      en: 'In a West African 12/8 ensemble the parts interlock instead of striking on the same beat.',
      ru: 'В западноафриканском ансамбле 12/8 партии сплетаются, а не бьют в одну долю.',
    },
    does: {
      en: 'Write H in a CronJob’s minute and the cluster picks a free beat for it, so jobs do not all start at once.',
      ru: 'Напишите H в минутах CronJob — и кластер выберет для задачи свободную долю, чтобы задачи не стартовали разом.',
    },
    cmd: "kubectl create cronjob drum --image=busybox --schedule='H 3 * * *' -- date",
  },
  {
    name: 'Credits',
    culture: {
      en: 'Big Mama Thornton recorded “Hound Dog” in 1952; most people know Elvis Presley’s version of 1956.',
      ru: 'Биг Мама Торнтон записала «Hound Dog» в 1952 году; большинство знает версию Элвиса Пресли 1956 года.',
    },
    does: {
      en: 'Every container image stands on other images. Credits shows that lineage and warns when it is not declared.',
      ru: 'Каждый образ контейнера стоит на других образах. Credits показывает эту родословную и предупреждает, если она не объявлена.',
    },
    cmd: 'sankofa credits deployment/web',
  },
  {
    name: 'Pulse',
    culture: {
      en: 'Talking drums carry speech in rhythm; spirituals answer a call.',
      ru: 'Говорящие барабаны передают речь ритмом; спиричуэлс отвечают на зов.',
    },
    does: {
      en: 'Node heartbeats and pod readiness, played as a drum ensemble in the listening room.',
      ru: 'Сердцебиение узлов и готовность подов, сыгранные барабанным ансамблем в комнате «Кластер звучит».',
    },
    cmd: 'kubectl get leases -n kube-node-lease',
    link: { hash: '#view=listen', en: 'Listen to the cluster', ru: 'Послушать кластер' },
  },
  {
    name: 'Roots',
    culture: {
      en: 'Rock, pop and metal grew from the blues, gospel and rhythm and blues, one documented step at a time.',
      ru: 'Рок, поп и метал выросли из блюза, госпела и ритм-н-блюза — шаг за шагом, и каждый шаг задокументирован.',
    },
    does: {
      en: 'Every artist is traced, link by sourced link, back to a card of the museum; every link carries two sources.',
      ru: 'Каждого исполнителя можно проследить звено за звеном до карточки музея; у каждого звена два источника.',
    },
    cmd: 'sankofa roots metallica',
    link: { hash: '#view=roots', en: 'Find your band’s roots', ru: 'Найти корни своей группы' },
  },
];

function term(cmd: string, multiline = false, table = false): HTMLElement {
  const el = h(`div.term.on${multiline ? '.multi' : ''}${table ? '.table' : ''}`, {}, h(multiline ? 'pre' : 'code', {}, cmd));
  el.append(
    multiline
      ? h('button.copy', { 'aria-label': t('Copy'), title: t('Copy'), onclick: async () => toast((await copyText(cmd)) ? t('Copied') : t('Copy failed')) }, svgIcon('copy'))
      : h('button', { onclick: async () => toast((await copyText(cmd)) ? t('Command copied') : t('Copy failed')) }, t('Copy')),
  );
  return el;
}

export class Engine {
  readonly el: HTMLElement;
  private yamlHost: HTMLElement;
  private tryHost: HTMLElement;
  onClose?: () => void;

  constructor(private app: App) {
    this.yamlHost = h('div.e-yaml');
    this.tryHost = h('div.e-try');
    const cards = app.set.all();
    const raw = cards.map((c) => app.raw(c.id) ?? c);
    const mine = readerCards(app.set, app.edition).length;
    const bar = h(
      'header.d-bar',
      {},
      h('span.d-title', {}, t('The engine room')),
      h('button.icon-btn', { 'aria-label': t('Close'), onclick: () => this.onClose?.() }, svgIcon('close')),
    );
    const body = h(
      'div.e-wrap',
      {},
      h(
        'header.e-head',
        {},
        h('div.kicker', {}, t('The engine room')),
        h('h2', {}, pick({ en: 'This museum is a cluster', ru: 'Этот музей — кластер' })),
        h(
          'p.e-lede',
          {},
          pick({
            en: 'Sankofa is a Kubernetes distribution. The museum you are reading runs in it, and every card in the museum is an object the cluster stores and serves, like a Deployment or a Service. The machinery that keeps the cluster alive is named after the culture it borrows from.',
            ru: 'Sankofa — дистрибутив Kubernetes. Музей, который вы читаете, работает в нём, а каждая карточка музея — объект, который кластер хранит и отдаёт, как Deployment или Service. Механизмы, которые поддерживают жизнь кластера, названы по той культуре, у которой они взяты.',
          }),
        ),
      ),
      h(
        'section.e-why',
        {},
        h('h3', {}, pick({ en: 'Why a cluster', ru: 'Почему кластер' })),
        h(
          'p',
          {},
          pick({
            en: 'In 2020 Kubernetes began to retire a word. The machine that runs the cluster stopped being called the master and became the control plane. Most engineers changed a label and moved on. This museum starts at that commit and goes back: to where the word came from, and to everything built, sung, written and invented by the people that pair of words was once made of.',
            ru: 'В 2020 году Kubernetes начал прощаться с одним словом. Машина, которая управляет кластером, перестала называться master и стала control plane. Большинство инженеров поправили метку и пошли дальше. Этот музей начинается с того коммита и идёт назад — к тому, откуда взялось это слово, и ко всему, что построили, спели, написали и придумали люди, о которых когда-то говорила эта пара слов.',
          }),
        ),
      ),
      h(
        'section.e-objects',
        {},
        h('h3', {}, pick({ en: 'Every card is an object', ru: 'Каждая карточка — объект' })),
        h(
          'p',
          {},
          pick({
            en: `Your copy of the museum holds ${count(mine, 'card', 'en')}; each is a Card object of the API group sankofa.kuberoot.dev. Griot, the cluster’s memory, loads them from the content repository; the museum and the terminal read the same objects.`,
            ru: `В вашем экземпляре музея ${count(mine, 'card', 'ru')}; каждая — объект Card из группы API sankofa.kuberoot.dev. Griot, память кластера, загружает их из репозитория содержания, а музей и терминал читают одни и те же объекты.`,
          }),
        ),
        h('div.e-count', { 'aria-hidden': 'true' }, h('b', {}, String(mine)), h('span', {}, pick({ en: 'Card objects', ru: 'объектов Card' }))),
        term(`$ kubectl get cards\n${cardTable(raw)}\n…`, true, true),
        this.yamlHost,
      ),
      h(
        'section.e-mech',
        {},
        h('h3', {}, pick({ en: 'The machinery, and where its names come from', ru: 'Механизмы и откуда их имена' })),
        h(
          'div.e-grid',
          {},
          MECHANISMS.map((m) =>
            h(
              'article.e-card',
              {},
              h('h4', {}, m.name),
              h('p.e-culture', {}, pick(m.culture)),
              h('p.e-does', {}, pick(m.does)),
              term(m.cmd),
              m.link ? h('a.btn', { href: m.link.hash, [m.link.hash.includes('roots') ? 'data-roots' : 'data-listen']: '' }, pick(m.link)) : null,
            ),
          ),
        ),
      ),
      h('section.e-trysec', {}, h('h3', {}, pick({ en: 'Try it yourself', ru: 'Попробуйте сами' })), this.tryHost),
      // A closing beat: the machinery serves the story, so the way leads back to it.
      h(
        'footer.e-close',
        {},
        h(
          'p',
          {},
          pick({
            en: 'All of this exists so the museum can remember: every card is kept, every deletion is argued over, every node keeps the beat.',
            ru: 'Всё это нужно для того, чтобы музей помнил: каждая карточка хранится, каждое удаление обсуждается, каждый узел держит ритм.',
          }),
        ),
        h('button.btn.primary', { onclick: () => this.onClose?.() }, pick({ en: 'Back to the story', ru: 'Вернуться к истории' })),
      ),
    );
    this.el = h('section.engine', { 'aria-label': t('The engine room'), tabindex: '-1' }, bar, body);
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.onClose?.();
    });
    document.body.append(this.el);
    this.renderTry(false);
    void fetch('visitor.kubeconfig', { method: 'HEAD' })
      .then((r) => this.renderTry(r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')))
      .catch(() => undefined);
  }

  get isOpen(): boolean {
    return this.el.classList.contains('open');
  }

  open(): void {
    this.renderYaml();
    this.el.classList.add('open');
    document.body.classList.add('locked');
    this.el.focus({ preventScroll: true });
  }

  close(): void {
    this.el.classList.remove('open');
    document.body.classList.remove('locked');
  }

  /** The YAML of the card the reader opened last. */
  private renderYaml(): void {
    const path = readPath();
    const opened = [...path].reverse().find((x) => this.app.raw(x));
    const c = this.app.raw(opened ?? 'equiano') ?? this.app.set.all()[0];
    if (!c) return;
    const title = this.app.set.get(c.id)?.title ?? c.title;
    this.yamlHost.replaceChildren(
      h(
        'p',
        {},
        // A first visit has opened nothing yet: show one card without claiming it was theirs.
        opened
          ? pick({ en: `The card you opened last, “${title}”, as the cluster stores it:`, ru: `Последняя открытая вами карточка, «${title}», — так её хранит кластер:` })
          : pick({ en: `One card, “${title}”, as the cluster stores it:`, ru: `Одна карточка, «${title}», — так её хранит кластер:` }),
      ),
      term(`$ kubectl get card ${c.id} -o yaml\n${cardYaml(c)}`, true),
    );
  }

  private renderTry(hasConfig: boolean): void {
    const cmds = hasConfig
      ? `export KUBECONFIG=$PWD/visitor.kubeconfig\nkubectl get cards\nkubectl get card equiano -o yaml\nsankofa dict equiano`
      : `hack/stand/visitor-kubeconfig.sh > visitor.kubeconfig\nexport KUBECONFIG=$PWD/visitor.kubeconfig\nkubectl get cards\nsankofa dict equiano`;
    this.tryHost.replaceChildren(
      h(
        'p',
        {},
        pick({
          en: 'The museum’s cluster is open to read: a visitor account can read the cards and the museum’s objects and cannot change anything.',
          ru: 'Кластер музея открыт для чтения: учётная запись посетителя может читать карточки и объекты музея и ничего не может изменить.',
        }),
      ),
      ...(hasConfig ? [h('a.btn.primary', { href: 'visitor.kubeconfig', download: 'visitor.kubeconfig' }, pick({ en: 'Download the visitor kubeconfig', ru: 'Скачать kubeconfig посетителя' }))] : []),
      term(cmds, true),
    );
  }
}
