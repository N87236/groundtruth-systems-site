# Current-state audit

Audit date: 2026-09-01

This document records the migration baseline. Production remains authoritative until the AWS preview passes parity review. No DNS, Netlify, or AWS production state was changed during this audit.

## Current repository architecture

The `main` branch is an older static, multi-page site:

- `index.html`, `services.html`, `about.html`, `contact.html`, and `project-mission-one.html`
- shared CSS in `assets/style.css`
- local hero, project imagery, report mockups, and two MP4 flyovers under `assets/`
- Google Fonts loaded from the browser
- external Unsplash imagery on the old home page
- a Netlify-compatible contact form in `contact.html`
- `.netlify/state.json` containing Netlify site ID `9d4b9791-5a64-4256-bfcc-8facadba2f81`
- `.netlify/netlify.toml` with `base` and `publish` hard-coded to `/home/nate/.openclaw/workspace/groundtruth-site`

The hard-coded Netlify paths are workstation-specific and are not a recoverable production deployment model.

## Current production architecture

Observed response and DNS behavior on 2026-09-01:

- both `groundtruth-systems.com` and `www.groundtruth-systems.com` resolved to `18.208.88.157` and `98.84.224.111`
- the origin response identified Netlify and included Netlify cache headers
- HTTPS and HSTS were enabled
- the deployed page was a single static HTML document
- Netlify injected a RUM script at response time; that injected tag is not application source

Current flow:

```text
Internet
  -> Netlify
    -> GroundTruth website
```

## Production content and behavior manifest

### Page and navigation

- sticky single-page navigation with `Outputs`, `Divisions`, `Process`, and `Contact`
- `outputs`, `divisions`, and `contact` IDs are present
- navigation references `process`, but the recovered production document has no matching `process` ID
- no favicon declaration was present
- page title was `GroundTruth Systems`; no meta description, canonical URL, Open Graph metadata, or analytics tag was authored in the document

### Visual system

- dark charcoal background, slate text, emerald active/accent state
- Inter body typography and Space Grotesk headings from Google Fonts
- Tailwind browser CDN and Font Awesome 6.5.1 CDN
- full-width aerial hero using `assets/images/hero.jpg`
- layered dark gradient, grid, vignette, and lower fade over the hero
- responsive Tailwind grids and breakpoint-based type/layout changes

### Hero

- `Operational Intelligence for the Physical World`
- field operations and geospatial intelligence label
- current positioning copy covering aerial intelligence, digital twins, infrastructure, construction, and agriculture
- two anchor CTAs
- FAA Part 107, Systems-Engineered, Field-Verified, and Central Florida indicators

### Deliverables

Six keyboard-operable report tabs:

1. Orthomosaic Site Map
2. Construction Progress Comparison
3. Roof Condition Assessment
4. Crop Stress Intelligence Report
5. Infrastructure Condition Monitoring
6. TwinView Digital Twin

The Crop Stress report is initially selected. Selection updates active state, ARIA attributes, title, subtitle, caption, image/object, and CTA. Arrow keys, Home, and End move between report tabs.

`View Larger` opens the selected report in a modal/lightbox. Escape, overlay click, and the close button dismiss it. Focus returns to the trigger.

### Recovered production assets

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `site/assets/images/hero.jpg` | 183190 | `876E46D3F33C21CAEDF93B987585EB570EAC1361E512003137AA61E611E769F4` |
| `dragon-fruit-farm-intelligence-report.png` | 2048060 | `F6765F6E540B192FCD6F29B8C85D7A9618A05CFAC606E234EB8CE92051DE63F4` |
| `construction-progress-intelligence-report.svg` | 11180 | `C3177BCAB49991F355368DE0660E046FE7BAE5E3B4FC9055444B83509837946C` |
| `infrastructure-condition-intelligence-report.svg` | 15334 | `0EA8CCE3A5EE272F9888647E7A943DF6C16CE04DDD1917EAF4E59FBEE2065356` |
| `orthomosaic-site-intelligence-report.svg` | 12148 | `5375C256A2C2C214C35BC2C9F02E28B70849882447EF2472CB0C8AEBF873EF53` |
| `roof-inspection-condition-report.svg` | 13362 | `D73128CDA099CC7672F3E4A6A1576131EBAB8DD734AF5763DD1CCA3248CF03B6` |
| `twinview-digital-twin-report.svg` | 16078 | `780EC9C8075DE436D490549DAC6294664EF9FBF7596F7F117F4E2F2794A03E1D` |

### Intelligence divisions

- TwinView: photogrammetry and digital twins
- InfraSight: infrastructure intelligence
- CropWatch: agriculture intelligence

### Authoritative contact content

- Nate Poole
- Founder & Principal Operator
- GroundTruth Systems
- Truth, delivered with precision.
- Greater Orlando, FL
- `(407) 637-9913`
- `nate@poole-holdings.com`

The production email is clickable. The production phone is plain text and must become a `tel:` link. Production contains no lead form.

## Repository versus production

### Production only

- current single-page visual design and positioning
- interactive, data-driven deliverable selector
- six current report assets and enlarged report lightbox
- TwinView, InfraSight, and CropWatch divisions
- current contact details and branding
- current production hero asset

### Old repository only

- multi-page information architecture
- mission-one project gallery and videos
- older services/about/contact copy
- Netlify form processing markup
- several local project/report assets and external Unsplash images

### Material differences

- production is a newer single-page experience; repository `main` must not be deployed
- production has no lead form, while the old repository form is coupled to Netlify
- production depends on browser-hosted Tailwind, Font Awesome, and Google Fonts
- production has a broken `#process` navigation target
- production metadata is minimal
- production phone is not clickable

## Preserve, improve, retire

Preserve exactly through preview parity:

- current structure, copy, colors, spacing, typography, hero, report assets, report selection, keyboard behavior, modal behavior, divisions, CTAs, and contact details

Improve after the recovered baseline is safely versioned:

- add the missing process section/ID without changing current visual language
- add a native AWS lead form and explicit success state
- make phone clickable
- add SEO, canonical, social, favicon, and structured metadata
- replace runtime Tailwind CDN with a reproducible local build and evaluate self-hosted fonts/icons
- add security headers after CSP compatibility testing

Retire only after AWS stabilization and explicit approval:

- `.netlify/netlify.toml`
- `.netlify/state.json`
- Netlify form/RUM dependencies
- root stale site as a deployment source; retain it in Git history

