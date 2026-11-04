// Seed corpus for the OD-1 spike. Each case is one block.
// `parity: false` marks cases where a difference is expected and required (the browser refuses includes).
// `expect` lists texts that must appear literally in the rendered SVG.

const salt = (body, name = '') => `@startsalt${name ? ' ' + name : ''}\n${body}\n@endsalt`;

const cases = [
  { name: 'salt-login', text: salt(`{^"Sign in"
  {
    Username | "alice     "
    Password | "****      "
    [X] Remember me | .
  }
  {[Sign in] | [Cancel]}
}`, 'Sign-in'), expect: ['Sign in', 'Username', 'Remember me', 'Cancel'] },
  { name: 'salt-controls', text: salt(`{+
  Text | "value   "
  [Button] | [ ] Unchecked
  (X) Selected | ( ) Other
  ^Closed^ | ^Open^^Option 1^^Option 2^
  ..
  ==
  ~~
  --
}`), expect: ['Button', 'Unchecked', 'Option 2'] },
  { name: 'salt-structures', text: salt(`{
  {/ Tab 1 | <b>Tab 2 | Tab 3 }
  {* File | Edit | Help }
  {#
    Column 1 | Column 2
    a | b
  }
  {T
    + Root
    ++ Child
    +++ Grandchild
  }
  {S
    Scroll line 1
    Scroll line 2
  }
}`), expect: ['Tab 2', 'Help', 'Column 2', 'Grandchild', 'Scroll line 2'] },
  { name: 'salt-spans-nesting', text: salt(`{!
  Name | "x" | .
  Wide | * | *
  { Nested | grid } | . | [Go]
  {-
    one
    two
  } | . | .
}`), expect: ['Nested', 'Go'] },
  { name: 'salt-ragged', text: salt(`{
  a | b | c
  d
  e | f
}`) },
  { name: 'salt-empty-grid', text: salt(`{
}`, 'Screen-1') },
  { name: 'salt-non-english', text: salt(`{
  Größe | "Ünïcödé  "
  日本語 | [Ок]
  عربي | Ελληνικά
}`, 'Écran-connexion'), expect: ['Größe', '日本語', 'Ок', 'Ελληνικά'] },
  { name: 'salt-two-roots', text: salt(`{
  first
}
{
  second
}`) },
  { name: 'salt-text-after-root', text: salt(`{
  first
}
trailing text`) },
  { name: 'salt-invalid-unclosed', text: salt(`{
  a | b
  {
    c
}`) },
  { name: 'salt-invalid-garbage', text: salt(`}}}`) },
  { name: 'salt-tree-table', text: salt(`{T#
  + Name | Value
  ++ a | 1
}`) },
  { name: 'salt-icons', text: salt(`{
  <&person> User | <&lock-locked> Locked
}`) },
  { name: 'salt-theme', text: `@startsalt\n!theme cerulean\n{\n  [Themed]\n}\n@endsalt`, expect: ['Themed'] },
  { name: 'salt-define', text: `@startsalt\n!define BTN [OK]\n{\n  BTN\n}\n@endsalt`, expect: ['OK'] },
  { name: 'salt-older-format', text: `@startuml Old\nsalt\n{\n  [Old]\n}\n@enduml` },
  { name: 'include-local', text: `@startsalt\n!include common.puml\n{\n  a\n}\n@endsalt`, parity: false },
  { name: 'include-stdlib', text: `@startuml\n!include <C4/C4_Context>\nPerson(a, "A")\n@enduml`, parity: false },
  { name: 'include-url', text: `@startuml\n!include https://example.com/x.puml\nA -> B\n@enduml`, parity: false },

  { name: 'flow-full', text: `@startuml Screen-flow
|User|
start
:[[#Sign-in Enter credentials]];
note right: Shown on first visit
|System|
if (Valid?) then (yes)
  :Load dashboard;
elseif (Locked?) then (locked)
  |User|
  :Show lock message;
  stop
else (no)
  :[[#Sign-in Retry]];
endif
|User|
repeat
  :Browse;
repeat while (More?) is (yes) not (no)
while (Items left?) is (yes)
  :Process item;
endwhile (done)
note left
  multi-line
  note
end note
stop
@enduml`, expect: ['Enter credentials', 'Load dashboard', 'Process item'] },
  { name: 'flow-empty-branches', text: `@startuml\nstart\nif (a?) then (yes)\nelse (no)\nendif\nrepeat\nrepeat while (b?)\nwhile (c?)\nendwhile\nstop\n@enduml` },
  { name: 'flow-locked-parts', text: `@startuml
start
fork
  :A;
fork again
  :B;
end fork
switch (x?)
case (1)
  :One;
case (2)
  :Two;
endswitch
partition Part {
  :Inside;
}
:Salt step
{{salt
{ [OK] }
}}
;
detach
@enduml` },
  { name: 'flow-legacy', text: `@startuml\n(*) --> "First"\n"First" --> (*)\n@enduml` },
  { name: 'flow-goto', text: `@startuml\nstart\nlabel here\n:a;\ngoto here\n@enduml` },
  { name: 'flow-invalid-if', text: `@startuml\nstart\nif (x?) then (yes)\n:a;\nstop\n@enduml` },
  { name: 'flow-non-english', text: `@startuml Flux-écran\nstart\n:[[#Écran-connexion Saisir les identifiants]];\n:日本語のステップ;\nstop\n@enduml`, expect: ['Saisir les identifiants', '日本語のステップ'] },
  { name: 'sequence', text: `@startuml\nAlice -> Bob : Hello\n@enduml`, expect: ['Hello'] },
];

// Escaping cases (FR-003/AC6): each text raw and with a candidate `~` escape, as a row's first cell and later.
const texts = ['{', '}', '|', '[x', '(a', '^a', '"q', '*a', '==a', '.', '...', '**b**', '//i//', '__u__', '""m""', '--s--', '~~w~~', 'a.b', '5 * 3', 'Title', 'Header 1', 'Legend', 'caption x', 'skinparam x', 'scale 2'];
const tilde = (t) => t.replace(/[{}|[\]()^"*=.\/_\-~]/g, (c) => '~' + c);
const unicode = (t) => t.replace(/[{}|[\]()^"*=.\/_\-~]/g, (c) => `<U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}>`);
const commandWord = /^(title|header|footer|caption|legend|mainframe|skinparam|scale)\b/i;
for (const [i, t] of texts.entries()) {
  for (const [form, written] of [['raw', t], ['tilde', tilde(t)], ['unicode', unicode(t)], ['zws', commandWord.test(t) ? '​' + t : null]]) {
    if (written === null) continue;
    cases.push({ name: `escape-${i}-${form}-first`, text: salt(`{\n  ${written} | x\n}`), expect: [t], escape: { text: t, form, cell: 'first' } });
    cases.push({ name: `escape-${i}-${form}-second`, text: salt(`{\n  x | ${written}\n}`), expect: [t], escape: { text: t, form, cell: 'second' } });
  }
}
for (const [form, label] of [['raw', 'Pick [x] or ]] | y'], ['tilde', 'Pick ~[x~] or ~]~] ~| y'], ['unicode', 'Pick <U+005B>x<U+005D> or <U+005D><U+005D> <U+007C> y']]) {
  cases.push({ name: `escape-link-${form}`, text: `@startuml\nstart\n:[[#Sign-in ${label}]];\nstop\n@enduml`, expect: ['Pick [x] or ]] | y'], escape: { text: 'link label', form, cell: 'step' } });
}

// Reference-size blocks for timing (SC-006): a screen of about 50 components, a flow of about 30 steps.
const rows = [];
for (let r = 1; r <= 25; r++) rows.push(`  Field ${r} | "value ${r}   "`);
cases.push({ name: 'reference-screen', text: salt(`{^"Reference"\n${rows.join('\n')}\n  {[Save] | [Cancel] | [Help]}\n}`, 'Reference'), reference: true });
const steps = ['@startuml Reference-flow', '|User|', 'start'];
for (let s = 1; s <= 10; s++) {
  steps.push(`:[[#Reference Step ${s}a]];`, s % 2 ? '|System|' : '|User|', `if (Check ${s}?) then (yes)`, `  :Step ${s}b;`, 'else (no)', `  :Step ${s}c;`, 'endif');
}
steps.push('stop', '@enduml');
cases.push({ name: 'reference-flow', text: steps.join('\n'), reference: true });

export default cases;
