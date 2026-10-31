[日本語版 (Japanese)](./page-selection-guide.ja.md)

# Page Selection Guide

Select test target pages based on site size and audit purpose. If target pages are not yet determined, follow this guide from URL collection through sampling.

## Overview

```
1. Collect URL list
   ↓
2. Apply exclusions (user-specified)
   ↓
3. Identify representative pages
   ↓
4. Random sampling (excluding representative pages)
   ↓
5. Deduplication & merge
   ↓
6. Final confirmation
```

## Sample Size Guidelines

Target **approximately 40 pages** as the baseline. **More than half should be representative pages**, with random samples filling the remainder.

| Site size (after exclusions) | Target pages |
|-----------------------------|--------------|
| ~40 pages | All pages |
| 40+ pages | ~40 pages (20-25 representative + 15-20 random) |
| 200+ pages | 40-55 pages (25-30 representative + 15-25 random) |

Even for smaller sites, testing around 40 pages is recommended unless pages are highly similar.

---

## Step 1: Collect URL List

### Priority
1. **sitemap.xml** (preferred if available)
2. **User-provided URL list** (CSV/text)
3. **Link collection with browser interaction** (fallback)

### Requirements
- Record where the URL list came from (sitemap.xml / user-provided / link collection).
- Read sitemap.xml with web retrieval and extract the `<loc>` URLs. For a sitemap index, read the child sitemaps too.
- For link collection, visit the key listing pages (top, products, news, blog, etc.), collect internal links and remove duplicates.

---

## Step 2: Apply Exclusions

Exclude bulk pages using the same template or pages outside audit scope.

### Exclusion Pattern Examples
| Pattern | Reason |
|---------|--------|
| `/download/[0-9]+` | Individual download pages (list page is representative) |
| `/news/[0-9]+` | Individual news articles (list page is representative) |
| `/seminar/[0-9]+` | Individual seminars (list page is representative) |
| `/tag/*` | Tag pages |
| `/page/[0-9]+` | Pagination |

### Execute Exclusion
- Record the exclusion patterns and reasons, and remove the URLs that match them from the list.

### User Confirmation Items
- Are exclusion patterns appropriate?
- Any additional patterns to exclude?
- Record exclusion reasons

---

## Step 3: Identify Representative Pages

Select pages that cover key functions and templates.

### Representative Page Categories (For Websites)

Aim for 20-25 pages from the following categories.

| Category | Description | Target |
|----------|-------------|--------|
| Entry pages | Top page, landing pages | 1-2 |
| Service/Product | Main service/product list and detail pages | 4-6 |
| Case studies | Case studies, portfolio list and detail pages | 3-4 |
| Content | Articles, blog, media list and detail pages | 3-5 |
| Forms | Pages with user input (contact, signup, etc.) | 3-5 |
| Information | Company info, FAQ, support, legal pages | 3-4 |
| Dynamic UI | Pages with modals, tabs, accordions, etc. | 1-2 |

**Selection principles:**
- Include both list and detail pages
- Prioritize different templates/layouts
- Prioritize pages with user interaction

### For Web Applications

For web applications, prioritize the following:

- Authentication screens (login, registration, password reset)
- Dashboard/Home
- List, detail, edit screens (CRUD operations)
- Settings/Profile screens
- Search/Filter functionality
- Notifications/Alerts
- Error states (404, permission errors, etc.)

### For Component Libraries

Component libraries are foundational and widely reused, so **all components should be tested in principle**.

Components of particular importance:
- Form components (inputs, selects, validation)
- Navigation components (menus, tabs, breadcrumbs)
- Modals/Dialogs
- Interactive components (accordions, tooltips)

### Auto-classification Example
```bash
case "$url" in
  */products) TYPE="Product list" ;;
  */products/*) TYPE="Product detail" ;;
  */inquiry/*|*/contact/*) TYPE="Form" ;;
  */news|*/blog) TYPE="Article list" ;;
  */news/*|*/blog/*) TYPE="Article detail" ;;
esac
```

---

## Step 4: Random Sampling

Randomly select from the list after excluding representative pages.

### Requirements
- Sample from the list that excludes representative pages (the sampling pool).
- If you use random numbers, record the seed and the means so the same result can be produced again.
- If no tool is available, select by a fixed procedure, such as sorting the URLs lexicographically and taking every k-th one, and record that procedure.
- **Important**: Record the seed value (or procedure) and the extraction method so anyone gets the same result.

---

## Step 5: Deduplication & Merge

Merge representative pages and random samples, checking for duplicates.

- Merge representative pages and random samples, and remove duplicate URLs.
- If removing duplicates leaves fewer pages than planned, extract the shortfall from the sampling pool by the same method.

---

## Step 6: Final Confirmation

Present the target page list to the user for approval.

### Checklist
- [ ] Do representative pages cover key functions?
- [ ] Are form pages included (input/confirm/complete)?
- [ ] Are pages with dynamic content included?
- [ ] Are exclusion reasons recorded?
- [ ] Are the seed value and the extraction method recorded?

### Output Format
````markdown
## Target Page List

### Selection Parameters
- URL collection method: [sitemap / crawl / user-provided]
- Total URLs collected: X
- Exclusion patterns: [pattern list]
- URLs after exclusion: Y
- Random seed: [seed value]
- Extraction method: [reproducible procedure]

### Representative Pages (Required)
| No. | URL | Page type | Selection reason |
|---|---|---|---|

### Random Sample (Supplementary)
| No. | URL | Page type |
|---|---|---|

### URL List to Pass to the Audit (one URL per line)
```
https://example.com/
https://example.com/products/
```
````
