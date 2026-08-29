# Needle Design Specification — ARCHIVED

> ## ⚠️ SUPERSEDED — do not implement from this document
>
> This describes the **Quiet Violet** palette, an earlier direction that was
> never built. Its brand hex (`#6757D9`), canvas (`#F8F8F6`), ink (`#18181B`)
> and category colours all differ from what ships.
>
> **The canonical design system is `src/theme/tokens.ts`** (Aurora
> Intelligence: cyan → indigo → violet, 90/10). See `AGENTS.md` for the
> design laws. This file is kept only as a record of the earlier exploration.
>
> Last updated: August 2026

---

## 1. Design Personality

**Quiet intelligence. Personal. Minimal. Trustworthy.**

### References
- Apple Health / Apple Reminders → simplicity
- Linear → information hierarchy
- Revolut → financial clarity
- Notion → calm surfaces
- Arc → modern interaction

### Avoid
- Generic "AI" gradients everywhere
- Dark futuristic dashboards
- Excessive glassmorphism
- Neon colors
- Huge illustrations
- Chatbot-style UI
- Showing model/confidence/technical terminology

---

## 2. Color Usage Ratio

```
85%  Neutral surfaces (canvas, surface, stroke)
10%  Semantic category accents (tiny dots, pills)
 5%  Brand violet (CTAs, active states, identity)
```

The UI should NOT look like purple everywhere / green cards / blue cards.
Instead: neutral white cards with tiny category accents.

---

## 3. Light Mode — Palette A (Primary)

### Foundation
```
canvas              #F8F8F6
canvasSubtle        #F1F1EF
surface             #FFFFFF
surfaceElevated     #FFFFFF
surfaceHighlight    #F4F2FF

stroke              #E7E6E2
strokeStrong        #D9D7D2
```

### Typography
```
ink                 #18181B
inkSecondary        #5F5F65
inkMuted            #8B8B91
inkDim              #A8A8AD
inkFaint            #E4E4E1
```

### Brand (restrained violet — 5% usage)
```
brand               #6757D9
brandHover          #5949C8
brandSoft           #F0EDFF
brandTint           #E7E2FF
```

**Rule:** Use violet sparingly enough that users notice it when it matters.

---

## 4. Dark Mode

### Foundation
```
canvas              #101012
canvasSubtle        #171719
surface             #1B1B1F
surfaceElevated     #222227
surfaceHighlight    #292833

stroke              #2D2D32
strokeStrong        #414047
```

### Typography
```
ink                 #F5F4F7
inkSecondary        #A7A5AE
inkMuted            #78767F
inkDim              #55535C
inkFaint            #34333A
```

### Brand (brighter for contrast)
```
brand               #8B7CF6
brandHover          #9A8CFF
brandSoft           #292541
brandTint           #39305F
```

---

## 5. Category Colors (desaturated, restrained)

| Category     | Accent   | Soft bg    | Use                      |
|-------------|----------|------------|--------------------------|
| Money       | #17845B  | #EAF6F0    | Expenses / income        |
| Payment Due | #A96F16  | #FFF4DE    | Bills / due dates        |
| Schedule    | #3975B8  | #EAF2FA    | Meetings / calendar      |
| Commitment  | #7358B6  | #F0ECFA    | Tasks / commitments      |
| Delivery    | #168E82  | #E8F6F4    | Deliveries               |
| Danger      | #C94A4A  | #FBECEC    | Delete / danger          |

**Important:** None of these colors are screaming. That's intentional.

Use category color on:
- Small indicator dot
- Small category pill (soft bg + color text)
- Important semantic value

Don't use as entire card background.

---

## 6. Typography — Plus Jakarta Sans

Keep all four weights: Regular, Medium, SemiBold, Bold.

| Role              | Size | Line | Weight    |
|-------------------|------|------|-----------|
| Display / Amount  | 28   | 34   | Bold      |
| Screen title      | 24   | 30   | SemiBold  |
| Header            | 22   | 28   | SemiBold  |
| Card title        | 16   | 22   | SemiBold  |
| Card supporting   | 14   | 20   | Regular   |
| Body              | 15   | 22   | Regular   |
| Caption           | 12   | 16   | Regular   |
| Metadata          | 11   | 15   | Medium    |
| Micro             | 10   | 13   | Medium    |

---

## 7. Remove ALL CAPS

Use sentence case:
- ~~NEEDS ATTENTION~~ → Needs attention
- ~~MONEY~~ → Money

---

## 8. Spacing — 8pt Grid

Keep: 2, 4, 8, 12, 16, 24, 32, 48, 64

Card vertical gap: **10px** (breathing room between decisions)

---

## 9. Card Styling

```
radius = 14px
background = surface (white)
border = 1px stroke
```

No heavy shadows. Use surface difference + border.

---

## 10. Insight Card

```
┌─────────────────────────────────────┐
│                                     │
│  ● Money                     2h ago │
│                                     │
│  HDFC credit card bill              │
│                                     │
│  ₹4,820                             │
│  Due in 3 days                      │
│                                     │
│  From HDFC Bank · Notification  ›   │
│                                     │
│  [ Track ]  [ Remind ]       Ignore │
│                                     │
└─────────────────────────────────────┘
```

**Hierarchy:** Insight → Value → Timing → Source → Action

---

## 11. Action Buttons

**Primary:** Filled brand (#6757D9), white text
**Secondary:** brandSoft bg (#F0EDFF), brand text
**Ignore:** Text only, inkMuted color

Contextual per category:
- Money: [Track] [Remind] Ignore
- Schedule: [Add to Calendar] Ignore
- Commitment: [Remind me] Ignore

---

## 12. Brand Violet Usage

### Use for:
- Needle logo
- Primary CTA (Track button)
- Active navigation
- Selected state
- Watch identity
- Focus states

### Don't use for:
- Entire backgrounds
- Every card
- Large gradients
- Every icon
- Every button
- Every heading

---

## 13. Source Provenance

```
From HDFC Bank · Notification   ›
```

Styling:
- font: 11px Medium
- color: inkMuted
- Tap → bottom sheet

---

## 14. Bottom Sheet

```
────────────────────────────────
             ─────

Why am I seeing this?

Needle found this in a notification
from HDFC Bank.

────────────────────────────────

Your HDFC Bank credit card
payment of ₹4,820 is due...

────────────────────────────────

Captured today · 10:42 AM

                         Done
```

Don't show: AI reasoning, Confidence scores, Classification labels

---

## 15. Navigation

Full navigation (all features):

```
Inbox     Spaces     Watch     Activity     More
```

Settings lives under More.

---

## 15a. Home Screen — Attention Dashboard

The Home screen is the primary product surface.
**Open Needle → understand what needs attention → act → leave.**

### Structure

```
┌───────────────────────────────────┐
│                                   │
│  N  Needle                    ••• │
│                                   │
│        ‹       Today       ›      │
│                                   │
│ Mon Tue Wed Thu Fri Sat Sun       │
│ 18  19  20  21  22  23  24       │
│                   ━━━             │
│                                   │
│ Inbox                          4  │
│ 4 things need your attention     │
│                                   │
│ ┌───────────────────────────────┐ │
│ │ Money                    2h   │ │
│ │ HDFC Credit Card Payment      │ │
│ │ ₹8,420                        │ │
│ │ Due Aug 24                    │ │
│ │ From HDFC Bank · Notification │ │
│ │ [ Track ] [ Remind ]   Ignore │ │
│ └───────────────────────────────┘ │
│                                   │
│ Recently handled              ›  │
│ ✓ Swiggy · ₹642              2h  │
│                                   │
│ ──────────────────────────────── │
│ Inbox   Spaces   Watch   Activity│
└───────────────────────────────────┘
```

### Components (5 only)

1. **Header** — Needle logo + ••• (More)
2. **Day selector** — compact `‹ Today ›` + week strip
3. **Inbox header** — count badge + subtitle
4. **Insight cards** — only unresolved items
5. **Recently handled** — compact actioned items

### What Home should NOT contain
- ❌ Heatmap → belongs in Insights/Analytics later
- ❌ Analytics / spending charts
- ❌ Monthly summaries
- ❌ Full notification history → Activity
- ❌ Raw captures → Activity
- ❌ Automation rules → Watch
- ❌ Connected apps → More/Settings
- ❌ Huge calendar → Needle isn't a calendar replacement
- ❌ AI confidence scores → never

### Key UX principle

```
Scan → Understand → Decide → Done
```

The user should be able to open Needle and in 3-5 seconds understand:
```
4 things need me.
1. ₹8,420 due Aug 24
2. ₹799 due in 6 days
3. Interview tomorrow 3 PM
4. Send report by Friday
```
---

## 16. Empty State

```
                 ✓

          You're all caught up

       Nothing needs your attention
                 right now.

         Needle will keep watching.
```

Small violet check. No giant illustration.

---

## 17. Activity — Timeline

```
Today

10:42
Tracked
Swiggy · ₹642

09:18
Added to calendar
Interview · 3:00 PM
```

Audit trail, not analytics dashboard.

---

## 18. Motion

```
fast       180ms
normal     200ms
slow       250ms
press       80ms
stagger      0 / 40 / 80ms
```

Spring: damping: 30, stiffness: 300, mass: 0.8

Responsive, not animated.

---

## 19. Haptics

| Action    | Level    |
|-----------|----------|
| Track     | light    |
| Remind    | light    |
| Calendar  | medium   |
| Ignore    | light    |
| Delete    | medium   |
| Success   | success  |

---

## 20. Icons — Lucide

| Context      | Size  | Stroke |
|-------------|-------|--------|
| Navigation   | 21px  | 2      |
| Card icon    | 18px  | 2      |
| Action icon  | 16px  | 2      |
| Metadata     | 14px  | 2      |

---

## 21. Pills — Reduce Usage

**Keep for:** Money, Schedule, Commitment, Status, Filters
**Don't use for:** Every action, Source, Timestamps

---

## 22. Radius System

```
sm       8
md       12
lg       14
xl       18
xxl      24
pill     9999
```

---

## 23. Final Visual Hierarchy

```
                    NEEDLE
                       ↓
                 WHAT MATTERS
                       ↓
                INSIGHT CARD
                       ↓
          ┌────────────┼────────────┐
          ↓            ↓            ↓
       WHAT         WHEN         SOURCE
          │
          ↓
       ACTION
```

---

## 24. Bottom Line

**Don't rebuild the styling system. Refine it.**

Target: Warm + restrained violet + insight-first + contextual actions = private personal intelligence layer

---

## 25. Palette Comparison

| Aspect | Palette A (Quiet Violet) | Palette B (Obsidian) | Palette C (Pearl) |
|--------|--------------------------|----------------------|-------------------|
| Feel | Calm, premium, personal | Futuristic, tech | Luxury, editorial |
| Default? | Yes | No | No |
| Best for | Needle's trust-first personality | OLED phones | Premium finance |
