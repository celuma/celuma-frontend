# Céluma — Design System (context for AI assistants)

This document describes **how and why the Céluma interface looks the way it does**: its
philosophy, tokens, custom components, and the patterns that repeat throughout the
app. It is intended so that anyone — or any AI — can contribute to the design while
maintaining consistency. It is **agnostic** to any one-off change: it describes the
state and rules of the system, not a history.

Céluma is a system for pathology/anatomy laboratories (orders, samples,
reports, patients, referring physicians, billing). The technical foundation is **React +
TypeScript + Vite**, using **Ant Design (antd v5)** as the base, but **wrapped and
re-styled** with custom components to achieve a consistent identity.

---

## 1. Design philosophy

1. **Soft, warm, and clinically friendly.** Céluma avoids a cold corporate look. It uses a
   cream background, a calm brand teal, and salmon accents. The status palette uses
   **soft pastels with saturated ink** (light background + text/icon in the same tone), not
   solid saturated color blocks.
2. **Cohesion through repetition.** The same color, icon, and shape represent the same idea
   everywhere. E.g., a status has **one color and one icon** used identically in
   its chip, in the step bar, and wherever it appears.
3. **Wrap antd, don't expose it.** antd provides accessibility and behavior (tables,
   selects, date pickers, tabs). But its default visual chrome (blue, 1px borders,
   typography) **is hidden or re-styled** with a Céluma wrapper. If something looks
   "too generic antd", that's design debt.
4. **Reusable custom components.** Before styling inline, look for an existing Céluma
   component. If a pattern repeats, extract it into a component.
5. **Clear typographic hierarchy.** Titles in **Baloo 2** (rounded, friendly);
   body in system-ui. Large numbers/KPIs also in Baloo.
6. **Comfortable density.** Generous radii (12–14px), consistent spacing, soft
   hover/focus states with teal rings.

---

## 2. Design tokens

Source of truth: `src/components/design/tokens.ts`.

```
Layout
  radius        14   // card border radius
  gap           12   // standard spacing in grids/stacks
  contentPadding 24
  cardPadding   24
  maxWidth      1400 // max width of centered content

Colors
  bg            #fbf6ec  // app background (warm cream)
  cardBg        #fff
  primary       #49b6ad  // brand TEAL (action, emphasis, links)
  accent        #49b6ad
  secondary     #F98D84  // SALMON (identity accent)
  secondaryTint #ffeeec
  textPrimary   #0d1b2a  // near-black navy
  textSecondary #6b7280  // secondary gray

Shadow
  shadow  0 10px 20px rgba(0,0,0,.08), 0 6px 6px rgba(0,0,0,.06)

Typography
  titleFont  'Baloo 2', system-ui, sans-serif
  textFont   system-ui, -apple-system, Segoe UI, Roboto, sans-serif
  titleSize 24 / titleWeight 800 / subtitleSize 14 / cardTitleSize 20
```

Exported derived styles: `cardStyle` (radius+shadow+bg), `cardTitleStyle`,
`pageTitleStyle`, `subtitleStyle`.

### Button / interaction palette (from `button.tsx`)
- **Teal:** base `#49b6ad`, hover `#3da8a0`, active `#2e9692`, disabled `#a8d4d0`,
  tint `#eaf7f5`.
- **Red (danger):** base `#e5484d`, hover `#dc2626`, active `#b91c1c`, tint `#fef2f2`.
- **Neutral:** border `#d1d5db`, text `#374151`.
- Field/panel borders: gray `#e5e7eb` / `#eef1f0`; teal focus ring
  `rgba(73,182,173,.20)`.

---

## 3. Status palette (color + ink + icon)

Core rule: **each status = an "ink" color + a soft background + an icon**, used
the same way in chips, badges, step bars, etc. Source: `src/components/ui/status_configs.tsx`.

**Order statuses** (`ORDER_STATUS_CONFIG`):

| Status     | label        | ink (color) | background (bg) | typical icon        |
|------------|--------------|-------------|-----------------|---------------------|
| RECEIVED   | Recibida     | `#3b82f6`   | `#eff6ff`       | InboxOutlined       |
| PROCESSING | En Proceso   | `#f59e0b`   | `#fffbeb`       | ExperimentOutlined  |
| DIAGNOSIS  | Diagnóstico  | `#8b5cf6`   | `#f5f3ff`       | SolutionOutlined    |
| REVIEW     | Revisión     | `#ec4899`   | `#fdf2f8`       | AuditOutlined       |
| CLOSED     | Cerrada      | `#0891b2`   | `#ecfeff`       | LockOutlined        |
| RELEASED   | Liberada     | `#10b981`   | `#ecfdf5`       | SendOutlined        |
| CANCELLED  | Cancelada    | `#ef4444`   | `#fef2f2`       | CloseCircleOutlined |

Notes:
- The order progress sequence is: Recibida → En Proceso → Diagnóstico →
  Revisión → Cerrada → Liberada (Cancelada is a terminal error state).
- Grays are avoided for active statuses: they clash with the pastel palette.
- There are also `SAMPLE_STATE_CONFIG`, `REPORT_STATUS_CONFIG`, `INVOICE_STATUS_CONFIG`
  and `SAMPLE_TYPE_CONFIG` (sample types with icon+color), with the same structure.

### The "soft avatar/circle" pattern
For circular icons with color identity (steps, sample types, entity avatars),
the Céluma pattern is: **background = ink at low opacity (`color + "1a"`),
icon = ink, border = ink at ~20% (`color + "33"`)**. It is the same language as the chip
(soft background + ink text), avoiding solid color circles with white icons.

---

## 4. Custom components (inventory)

All live in `src/components/ui/` unless noted otherwise. Rule: **use these before
styling inline**.

### Buttons and interaction
- **`button.tsx` → `CelumaButton`**: button system. `type="primary"` = teal fill;
  default = outline (neutral → teal on hover); `danger` = red. Sizes: `default`
  (tall pill CTA, radius 999), `small` (compact rect, radius 10), `xsmall` (dense chip,
  radius 8). **Icon-only** buttons are borderless with tint on hover (fit inside
  a Panel).
- **`action_button_panel.tsx` → `ActionButtonPanel`**: "segmented pill" — a `Panel`
  with icon/label buttons separated by thin dividers. Supports `icon`, `label`,
  `active` (fill/tint), `danger`, `disabled`, and manual or automatic dividers. It is
  the base block for toolbars (edit/activate) and table pagination.

### Containers
- **`panel.tsx` → `Panel`**: neutral container (2px border `#e5e7eb`, radius 12, background
  `#fafbfc`). For grouping content inside cards/forms. Re-themed via `style`
  (e.g., amber warning panel, description panel, etc.).
- **`page_header.tsx` → `PageHeader`**: standard page header: card with
  **5px salmon left border**, Baloo title 24/800, subtitle, and `extra` slot
  for CTA. Used at the top of every view.

### Form fields (Céluma look: 2px teal outline, radius 12, focus ring)
- **`floating_caption_input.tsx` → `FloatingCaptionInput`**: input with **floating
  caption** (label rises and shrinks on focus/fill), required asterisk,
  inline error message with auto-hide.
- **`floating_caption_select.tsx` → `FloatingCaptionSelect`**: same but Select (antd
  borderless inside). Single value (`value: string`).
- **`floating_caption_multiselect.tsx` → `FloatingCaptionMultiSelect`**: multi-select
  sibling (`value: string[]`). Same teal outline + floating caption, but
  **auto-grows** so selected tags fit; tags use teal tint. Use for roles, branches, etc.,
  so multi-selects look like the rest of the fields.
- **`floating_caption_date.tsx` → `FloatingCaptionDate`**: date picker with floating
  caption and **teal-themed calendar** (selected day teal fill, today with ring,
  hover tint, rounded popup). Replaces the generic DatePicker.
- **`floating_caption_password.tsx`**: password variant.
- **`textarea_field.tsx` → `CelumaTextArea`**: multiline textarea with the same outline.
  Supports `maxLength` with counter, `error`, and an **`action`** slot (integrated control
  bottom-right inside the field, e.g. a Telegram-style send button), plus
  `inputRef`/`onKeyDown` for advanced logic (cursor, shortcuts).
- **`search_field.tsx` → `SearchField`**: search input with teal icon and clear button;
  `small` variant to align with `size="small"` buttons.
- **`modal_form_footer.tsx` → `ModalFormFooter`**: standard footer for create/edit modals —
  "required fields" note on the left + **Cancel** (outline danger) and **submit** (primary)
  on the right. Goes **inside** the `<form>` so the primary button submits. Ensures all
  configuration forms close the same way.
- **`select_field.tsx`, `date_field.tsx`, `text_field.tsx`, `checkbox.tsx`,
  `form_field.tsx`** (react-hook-form `Controller` wrapper), `field_message.tsx`,
  `error_text.tsx`.

### Data / tables
- **`table.tsx` → `CelumaTable`**: standard table. Wraps antd Table and adds:
  Céluma styles, **optional integrated search** (`searchable`, `searchPlaceholder`,
  `searchFilter`), default sorting, row click, illustrated empty state, and
  **custom pagination** (hides antd's and renders `CelumaPagination`). All
  list views use it.
- **`lib/search.ts` → `matchesQuery(values, query)`**: shared search engine used by
  `CelumaTable` search. **Normalizes accents** (`Muñóz`≈`munoz`), is
  **separator-insensitive** (`ctm18` finds `CTM-18`), supports **multi-word AND**
  and **conservative typo tolerance** (Levenshtein by length; purely numeric terms
  require exact match). Each list builds its `searchFilter` as
  `(r, q) => matchesQuery([fieldA, fieldB, ...], q)` — do not reimplement per page.
- **`celuma_sortable_list.tsx` → `CelumaSortableList`**: generic **drag-to-reorder**
  list. Each row has a **teal handle on the left and only the handle initiates drag**,
  so checkboxes/inputs/buttons inside the row remain interactive (unlike making the
  entire row `draggable`). Built on **Pointer Events**, not the native HTML5 Drag &
  Drop API (same approach as dnd-kit / Framer Motion `Reorder` / Trello) — HTML5 DnD
  only reports position on `drop`, which reads as laggy and dead until release. Here
  the grabbed row **tracks the cursor 1:1** via an un-transitioned `transform` (feels
  instant regardless of drag distance), tilts and lifts (`scale(1.02) rotate(-0.4deg)`,
  elevated shadow, teal ring), and the cursor switches to a **"grabbing" hand
  globally** (not just over the handle). The list **reorders live** as the dragged
  row's center crosses a neighbor's midpoint (closest-center collision), and the
  displaced rows play a **FLIP transform animation** *during* the drag, not after —
  so the rearrangement is visible the whole time. On release the grabbed row simply
  eases its last bit of cursor offset back to zero (it's already in its final slot),
  giving a quick "settle" instead of a second, disconnected animation. API: `items`
  (with `key`), `onReorder`, `renderItem`. Used in the template editor (base fields
  and sections).
- **`celuma_pagination.tsx` → `CelumaPagination`**: pagination built on
  `ActionButtonPanel` (single pill: ‹ previous · numbers · next ›), with
  number window + ellipsis and active page in soft teal.
- **`celuma_steps.tsx` → `CelumaSteps`**: progress bar. Each step shows its
  **characteristic color and icon** (soft circle + ink icon), current with ring,
  pending in gray, and **gradient connectors** between completed step colors.
- **`table_helpers.tsx`**: shared helpers — `renderStatusChip(status, type)`,
  `renderActiveChip(isActive)` (unified Active/Inactive green/red chip) + `activeFilter()`
  (`filters`/`onFilter` pair for boolean columns), `renderLabels`, `getSampleTypeConfig`,
  `SampleTypeBadge`, `getInitials`, `getAvatarColor`, `stringSorter`, `PatientCell`, etc.
- **`stats_card.tsx`, `dashboard_summary.tsx`, `recent_activity.tsx`**.

### Navigation / overlays
- **`sidebar_menu.tsx` → `SidebarCeluma`**: teal sidebar with the isotype.
- **`tooltip.tsx` → `Tooltip`**: consistent rounded navy tooltip.
- **`celuma_modal.tsx`, `confirm_dialog.tsx`, `celuma_alert.tsx`,
  `celuma_notification_proxy.tsx`** (unified feedback via `lib/celuma_feedback`).

### Conversation (chat)
- **`components/comments/conversation_thread.tsx` → `ConversationThread`**: Telegram/Discord-style
  chat thread but Céluma. **Groups consecutive messages from the same author**
  (~5 min window): avatar+name once, stacked bubbles. Own messages on the
  **right in teal** (`#eaf7f5`), others on the **left in gray** (`#f1f5f9`).
  **Day separators** (Today/Yesterday/date). `forwardRef` to the scrollable container.
- **`components/comments/comment_input.tsx` → `CommentInput`**: composer with `@` mention
  search. `chat` variant = icon-only send button integrated inside the field,
  no caption. Uses `CelumaTextArea`.

---

## 5. Page patterns

### a) List views (Orders, Patients, Samples, Reports, etc.)
```
<Layout> + <SidebarCeluma>
  <Layout.Content bg=tokens.bg>
    <div maxWidth=tokens.maxWidth center grid gap=tokens.gap>
      <PageHeader title subtitle extra={<CelumaButton primary/>} />
      <Card cardStyle>
        <CelumaTable searchable searchFilter columns dataSource ... />
      </Card>
```
Search and pagination live **inside** `CelumaTable` (do not reimplement per
page). Each status column uses `renderStatusChip`.

### b) Detail views — the "profile / badge" pattern
Entity detail pages (patient, referring physician, order) open with a
**profile card**: a card with **salmon left border**, relative positioning, and:
- **Chips top-right** (absolute position): entity code (salmon chip
  `codeChipStyle`) + status (status color chip with its icon).
- **Large avatar** (~104px) on the left (initials with `getAvatarColor`, or image).
- **Name** as `<h1>` Baloo 26/800 + subtitle/code.
- **Metadata row** with `MetaItem` (teal icon + text): specialty, contact,
  date, etc.
- **Stats block** with thin dividers (`Stat`: large Baloo number + label) e.g.
  Orders / Reports / Samples.
- **`ActionButtonPanel`** with actions (edit, activate/deactivate, etc.).

Local helpers reused in these profiles: `codeChipStyle`, `statusChipStyle(cfg)`,
`MetaItem({icon, children})`, `Stat({value, label, color})`.

Below the profile card there are usually content cards (history tables, tabs, etc.).

### c) Forms (create/edit)
```
<PageHeader title subtitle />
<Card cardStyle>
  <form gap=28>
    <section gap=16>
      <SectionTitle>…</SectionTitle>   // h3 Baloo 18/700
      <div grid-2 / grid-3>
        <FormField control name render={props => <FloatingCaptionInput .../>}/>
        ...
```
- Fields always use `FloatingCaption*` (input/select/date) — teal outline, floating
  caption, asterisk for required fields.
- Form footer: "fields marked with * are required" note + **Cancel**
  (danger/outline) and **Save/Register** (primary) buttons.
- Validation with `react-hook-form` + `zod`, wired through `FormField`.
- Numeric inputs (phone, etc.): `inputMode="numeric"` + sanitize to digits.

**CRUD forms in modal (configuration).** Short configuration CRUD (users,
reviewers, study types, price catalog, templates) live in a **`CelumaModal`**
(Céluma chrome: Baloo teal title, rounded borders) instead of an antd `<Modal>`,
and use **exactly the same** `FloatingCaption*` + `Panel`+`Switch` (status) + `ModalFormFooter`,
all wired with `react-hook-form` + `zod`. **Create and edit share the same form**
(same field composition; only title, default values, and whether password is
required change). Rule: never use raw antd `Form`/`Input`/`Select` in these modals —
they clash with the rest of the fields.

### d) Tabs
When a view has sections (e.g. order detail: Timeline / Samples /
Report / Conversation), antd `Tabs` are used **re-styled to teal** (custom class):
active ink teal, 3px rounded teal ink bar, soft bottom divider. The most
consulted section is set as the **default tab** to avoid scrolling.

### e) Empty states
Céluma pattern: a centered `Panel` (or card) with a **soft teal circle + icon**, a
Baloo title, gray description and, if applicable, an action `CelumaButton`. For tables,
use antd's illustrated `Empty` inside a soft container.

---

## 6. Conventions and "do / don't"

**Do:**
- Reuse Céluma components and `tokens`. Statuses → shared `*_CONFIG` +
  `renderStatusChip`.
- Teal `#49b6ad` for action/emphasis/links; salmon `#F98D84` for identity
  accent (left border of headers/profiles, code chip).
- Chips/avatars with the **soft background + ink** pattern (not solid + white).
- Radii 12–14, 2px borders on fields, soft teal focus rings.
- Titles in Baloo 2; numbers/KPIs in Baloo.
- Hide/re-theme antd chrome (blue ink, 1px borders, buttons).

**Avoid:**
- Grays for active statuses (clash with the pastel palette).
- Default antd blue on buttons/tabs/links.
- Nested antd cards/containers without wrapping (look "too antd").
- Off-brand teals (e.g. `#0f8b8d`): always use `#49b6ad`.
- Reimplementing search/pagination per page (lives in `CelumaTable`).

---

## 7. Reference structure

```
src/
  components/
    design/tokens.ts            // tokens + derived styles
    ui/                         // Céluma components (buttons, fields, table, steps, …)
      status_configs.tsx        // status palette (color/bg/label/icon)
      table_helpers.tsx         // chips, badges, sorters, avatars
    comments/                   // chat: ConversationThread, CommentInput, utils
  pages/                        // views (lists, details, forms)
  hooks/ , lib/ , services/
```

**Golden rule:** if something looks inconsistent with the above, the solution is almost
always to *wrap antd with a Céluma component*, *reuse the status `*_CONFIG`* or
*apply the `tokens`*, instead of hand-styling with new values.
