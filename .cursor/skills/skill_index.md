# Cursor skills index

Repo: **glassspider** (Laightworks ecosystem). Skills are optional helpers; product rules live in `.cursor/rules/`.

Project agent skills live in **flat** folders: `.cursor/skills/<folder>/SKILL.md`. Each folder’s YAML `name` and `description` drive how the agent discovers when to use the skill.

**Current inventory:**

1. **Impeccable (UI / UX design)** — layout, motion, copy, critique, etc. Several depend on `frontend-design` for context.
2. **Mapbox** — from [mapbox/mapbox-agent-skills](https://github.com/mapbox/mapbox-agent-skills), installed with `npx skills add mapbox/mapbox-agent-skills -y`. The skills CLI targets Open Plugins `.agents/skills`; this repo keeps **one** copy next to the design skills under `.cursor/skills` so everything stays flat and versioned together.

**Maintenance:** When you add, remove, or rename a skill folder, update this file so it stays accurate.

### Impeccable (UI / UX)

| Folder | `name` | What it is for (from `description`) |
|--------|--------|--------------------------------------|
| `adapt` | adapt | Adapt designs to work across different screen sizes, devices, contexts, or platforms. Implements breakpoints, fluid layouts, and touch targets. Use when the user mentions responsive design, mobile layouts, breakpoints, viewport adaptation, or cross-device compatibility. |
| `animate` | animate | Review a feature and enhance it with purposeful animations, micro-interactions, and motion effects that improve usability and delight. Use when the user mentions adding animation, transitions, micro-interactions, motion design, hover effects, or making the UI feel more alive. |
| `arrange` | arrange | Improve layout, spacing, and visual rhythm. Fixes monotonous grids, inconsistent spacing, and weak visual hierarchy. Use when the user mentions layout feeling off, spacing issues, visual hierarchy, crowded UI, alignment problems, or wanting better composition. |
| `audit` | audit | Run technical quality checks across accessibility, performance, theming, responsive design, and anti-patterns. Generates a scored report with P0-P3 severity ratings and actionable plan. Use when the user wants an accessibility check, performance audit, or technical quality review. |
| `bolder` | bolder | Amplify safe or boring designs to make them more visually interesting and stimulating. Increases impact while maintaining usability. Use when the user says the design looks bland, generic, too safe, lacks personality, or wants more visual impact and character. |
| `clarify` | clarify | Improve unclear UX copy, error messages, microcopy, labels, and instructions to make interfaces easier to understand. Use when the user mentions confusing text, unclear labels, bad error messages, hard-to-follow instructions, or wanting better UX writing. |
| `colorize` | colorize | Add strategic color to features that are too monochromatic or lack visual interest, making interfaces more engaging and expressive. Use when the user mentions the design looking gray, dull, lacking warmth, needing more color, or wanting a more vibrant or expressive palette. |
| `critique` | critique | Evaluate design from a UX perspective, assessing visual hierarchy, information architecture, emotional resonance, cognitive load, and overall quality with quantitative scoring, persona-based testing, and actionable feedback. Use when the user asks to review, critique, evaluate, or give feedback on a design or component. |
| `delight` | delight | Add moments of joy, personality, and unexpected touches that make interfaces memorable and enjoyable to use. Elevates functional to delightful. Use when the user asks to add polish, personality, animations, micro-interactions, delight, or make an interface feel fun or memorable. |
| `distill` | distill | Strip designs to their essence by removing unnecessary complexity. Great design is simple, powerful, and clean. Use when the user asks to simplify, declutter, reduce noise, remove elements, or make a UI cleaner and more focused. |
| `extract` | extract | Extract and consolidate reusable components, design tokens, and patterns into your design system. Identifies opportunities for systematic reuse and enriches your component library. Use when the user asks to create components, refactor repeated UI patterns, build a design system, or extract tokens. |
| `frontend-design` | frontend-design | Create distinctive, production-grade frontend interfaces with high design quality. Generates creative, polished code that avoids generic AI aesthetics. Use when the user asks to build web components, pages, artifacts, posters, or applications, or when any design skill requires project context. *(Licensed Apache 2.0; based on Anthropic’s frontend-design skill per that skill’s frontmatter.)* |
| `harden` | harden | Improve interface resilience through better error handling, i18n support, text overflow handling, and edge case management. Makes interfaces robust and production-ready. Use when the user asks to harden, make production-ready, handle edge cases, add error states, or fix overflow and i18n issues. |
| `normalize` | normalize | Audits and realigns UI to match design system standards, spacing, tokens, and patterns. Use when the user mentions consistency, design drift, mismatched styles, tokens, or wants to bring a feature back in line with the system. |
| `onboard` | onboard | Designs and improves onboarding flows, empty states, and first-run experiences to help users reach value quickly. Use when the user mentions onboarding, first-time users, empty states, activation, getting started, or new user flows. |
| `optimize` | optimize | Diagnoses and fixes UI performance across loading speed, rendering, animations, images, and bundle size. Use when the user mentions slow, laggy, janky, performance, bundle size, load time, or wants a faster, smoother experience. |
| `overdrive` | overdrive | Pushes interfaces past conventional limits with technically ambitious implementations — shaders, spring physics, scroll-driven reveals, 60fps animations. Use when the user wants to wow, impress, go all-out, or make something that feels extraordinary. |
| `polish` | polish | Performs a final quality pass fixing alignment, spacing, consistency, and micro-detail issues before shipping. Use when the user mentions polish, finishing touches, pre-launch review, something looks off, or wants to go from good to great. |
| `quieter` | quieter | Tones down visually aggressive or overstimulating designs, reducing intensity while preserving quality. Use when the user mentions too bold, too loud, overwhelming, aggressive, garish, or wants a calmer, more refined aesthetic. |
| `teach-impeccable` | teach-impeccable | One-time setup that gathers design context for your project and saves it to your AI config file. Run once to establish persistent design guidelines. |
| `typeset` | typeset | Improves typography by fixing font choices, hierarchy, sizing, weight, and readability so text feels intentional. Use when the user mentions fonts, type, readability, text hierarchy, sizing looks off, or wants more polished, intentional typography. |

### Mapbox (mapbox-agent-skills)

| Folder | `name` | What it is for (from `description`) |
|--------|--------|--------------------------------------|
| `mapbox-android-patterns` | mapbox-android-patterns | Official integration patterns for Mapbox Maps SDK on Android. Covers installation, adding markers, user location, custom data, styles, camera control, and featureset interactions. Based on official Mapbox documentation. |
| `mapbox-cartography` | mapbox-cartography | Expert guidance on map design principles, color theory, visual hierarchy, typography, and cartographic best practices for creating effective and beautiful maps with Mapbox. Use when designing map styles, choosing colors, or making cartographic decisions. |
| `mapbox-data-visualization-patterns` | mapbox-data-visualization-patterns | Patterns for visualizing data on maps including choropleth maps, heat maps, 3D visualizations, data-driven styling, and animated data. Covers layer types, color scales, and performance optimization. |
| `mapbox-geospatial-operations` | mapbox-geospatial-operations | Expert guidance on choosing the right geospatial tool based on problem type, accuracy requirements, and performance needs |
| `mapbox-google-maps-migration` | mapbox-google-maps-migration | Migration guide for developers moving from Google Maps Platform to Mapbox GL JS, covering API equivalents, pattern translations, and key differences |
| `mapbox-ios-patterns` | mapbox-ios-patterns | Official integration patterns for Mapbox Maps SDK on iOS. Covers installation, adding markers, user location, custom data, styles, camera control, and featureset interactions. Based on official Mapbox documentation. |
| `mapbox-maplibre-migration` | mapbox-maplibre-migration | Guide for migrating from MapLibre GL JS to Mapbox GL JS, covering API compatibility, token setup, style configuration, and the benefits of Mapbox's official support and ecosystem |
| `mapbox-mcp-devkit-patterns` | mapbox-mcp-devkit-patterns | Integration patterns for Mapbox MCP DevKit Server in AI coding assistants. Covers setup, style management, token management, validation workflows, and documentation access through MCP. Use when building Mapbox applications with AI coding assistance. |
| `mapbox-mcp-runtime-patterns` | mapbox-mcp-runtime-patterns | Integration patterns for Mapbox MCP Server in AI applications and agent frameworks. Covers runtime integration with pydantic-ai, mastra, LangChain, and custom agents. Use when building AI-powered applications that need geospatial capabilities. |
| `mapbox-search-integration` | mapbox-search-integration | Complete workflow for implementing Mapbox search in applications - from discovery questions to production-ready integration with best practices |
| `mapbox-search-patterns` | mapbox-search-patterns | Expert guidance on choosing the right Mapbox search tool and parameters for geocoding, POI search, and location discovery |
| `mapbox-store-locator-patterns` | mapbox-store-locator-patterns | Common patterns for building store locators, restaurant finders, and location-based search applications with Mapbox. Covers marker display, filtering, distance calculation, and interactive lists. |
| `mapbox-style-patterns` | mapbox-style-patterns | Common style patterns, layer configurations, and recipes for typical mapping scenarios including restaurant finders, real estate, data visualization, navigation, delivery/logistics, and more. Use when implementing specific map use cases or looking for proven style patterns. |
| `mapbox-style-quality` | mapbox-style-quality | Expert guidance on validating, optimizing, and ensuring quality of Mapbox styles through validation, accessibility checks, and optimization. Use when preparing styles for production, debugging issues, or ensuring map quality standards. |
| `mapbox-token-security` | mapbox-token-security | Security best practices for Mapbox access tokens, including scope management, URL restrictions, rotation strategies, and protecting sensitive data. Use when creating, managing, or advising on Mapbox token security. |
| `mapbox-web-integration-patterns` | mapbox-web-integration-patterns | Official integration patterns for Mapbox GL JS across popular web frameworks (React, Vue, Svelte, Angular). Covers setup, lifecycle management, token handling, search integration, and common pitfalls. Based on Mapbox's create-web-app scaffolding tool. |
| `mapbox-web-performance-patterns` | mapbox-web-performance-patterns | Performance optimization patterns for Mapbox GL JS web applications. Covers initialization waterfalls, bundle size, rendering performance, memory management, and web optimization. Prioritized by impact on user experience. |

**Counts:** 21 design skills + 17 Mapbox = **38** skills total.
