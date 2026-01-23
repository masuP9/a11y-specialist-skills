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
3. **Playwright link crawling** (fallback)

### Check sitemap.xml
```bash
curl -s https://example.com/sitemap.xml | grep -oP '(?<=<loc>)[^<]+'
```

### Playwright Link Collection
Crawl key listing pages and collect links.

```javascript
// Example pages to visit
const pagesToVisit = [
  '/',
  '/products/',
  '/news/',
  '/blog/',
];

// Collect internal links from each page
const links = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a[href^="/"]'))
    .map(a => a.href)
    .filter((v, i, a) => a.indexOf(v) === i)
);
```

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
```bash
grep -v -E '/download/[0-9]+$' urls.txt | \
grep -v -E '/news/[0-9]+$' | \
grep -v -E '/seminar/[0-9]+$' > filtered-urls.txt
```

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

### Seeded Random Extraction
```bash
SEED="wcag-audit-$(date +%Y-%m-%d)"

# Exclude representative pages
grep -xvF -f representative-pages.txt filtered-urls.txt > sampling-pool.txt

# Seeded random extraction
shuf --random-source=<(openssl enc -aes-256-ctr -pass pass:"$SEED" -nosalt </dev/zero 2>/dev/null) \
  -n 10 sampling-pool.txt > random-sample.txt
```

**Important**: Record the seed value for reproducibility.

---

## Step 5: Deduplication & Merge

Merge representative pages and random samples, checking for duplicates.

```bash
# Merge
cat representative-pages.txt random-sample.txt > combined-pages.txt

# Check duplicates
DUPLICATES=$(sort combined-pages.txt | uniq -d | wc -l)

# Extract additional samples if duplicates found
if [ $DUPLICATES -gt 0 ]; then
  grep -xvF -f combined-pages.txt sampling-pool.txt > remaining-pool.txt
  shuf -n $DUPLICATES remaining-pool.txt >> random-sample.txt
fi
```

---

## Step 6: Final Confirmation

Present the target page list to the user for approval.

### Checklist
- [ ] Do representative pages cover key functions?
- [ ] Are form pages included (input/confirm/complete)?
- [ ] Are pages with dynamic content included?
- [ ] Are exclusion reasons recorded?
- [ ] Is the seed value recorded?

### Output Format
```markdown
## Target Page List

### Selection Parameters
- URL collection method: [sitemap / crawl / user-provided]
- Total URLs collected: X
- Exclusion patterns: [pattern list]
- URLs after exclusion: Y
- Random seed: [seed value]

### Representative Pages (Required)
| No. | URL | Page type | Selection reason |
|---|---|---|---|

### Random Sample (Supplementary)
| No. | URL | Page type |
|---|---|---|
```
