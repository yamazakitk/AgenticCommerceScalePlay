# Design System — Harvest & Co.

## Product Context
- **Name:** Harvest & Co.
- **Description:** A premium, organic supermarket EC site specializing in fresh, local, and gourmet groceries.
- **Target Audience:** Health-conscious individuals, families, food enthusiasts, and premium shoppers looking for high-quality food.
- **Project Type:** E-commerce Site (Top page, Product detail page, Cart page).

## Aesthetic Direction
- **Direction:** Premium Organic & Refined
- **Decoration Level:** Intentional (warm shadows, fine borders, clean layouts)
- **Vibe:** Warm, airy, high-contrast, clean, and elegant.

## Typography
- **Primary Headings & UI:** [Outfit](https://fonts.google.com/specimen/Outfit) (weights: 400, 500, 600, 700)
- **Body Text:** [DM Sans](https://fonts.google.com/specimen/DM+Sans) (weights: 400, 500)
- **Numbers/Tables:** [DM Sans](https://fonts.google.com/specimen/DM+Sans) with tabular numbers enabled.
- **Loading:** Google Fonts CDN
- **Scale:**
  - `h1`: 2.5rem (40px)
  - `h2`: 1.75rem (28px)
  - `h3`: 1.25rem (20px)
  - `body`: 1rem (16px)
  - `small`/`ui`: 0.875rem (14px)

## Color Palette
- **Primary:** `#1A3A2B` (Deep Forest Green) - represents freshness, quality, and organic farming.
- **Accent:** `#D4A373` (Muted Warm Amber) - represents baking, grains, soil, warmth, and premium touch.
- **Neutrals:**
  - Background (Page): `#FAFAF7` (Warm Off-white)
  - Background (Cards/Panels): `#FFFFFF` (Pure White)
  - Text Primary: `#2A2E2B` (Charcoal)
  - Text Secondary: `#5C625E` (Muted Sage Grey)
  - Borders/Divider: `#EAEAE3` (Light Warm Grey)
- **Semantic Colors:**
  - Success: `#2E7D32` (Sage Green)
  - Warning: `#E65100` (Warm Amber)
  - Error: `#C62828` (Crimson Red)
  - Info: `#0288D1` (Soft Blue)

## Spacing & Grid
- **Baseline Unit:** 8px
- **Scale:**
  - `xs`: 4px
  - `sm`: 8px
  - `md`: 16px
  - `lg`: 24px
  - `xl`: 32px
  - `2xl`: 48px
  - `3xl`: 64px
- **Layout Max Width:** 1200px
- **Border Radius:**
  - Cards & Buttons: 8px (`md`)
  - Badges & Inputs: 4px (`sm`)
  - Profile/Pills: 9999px (`full`)

## Motion & Transitions
- **Hover Lift:** `transform: translateY(-4px)`, `box-shadow: 0 10px 20px rgba(26, 58, 43, 0.05)` (short duration)
- **Fade/Slide-in (Cart Panel):** `transition: transform 0.3s ease-out`
- **Add to Cart Animation:** Quick scale-up scale-down of badge or micro-bounce.
