

## Fix "Начать бесплатно" button in presentation

The button on the final slide of the presentation (line 656 in `PlatformPresentation.tsx`) is a plain `div` with no navigation — just `cursor-pointer`. Same for "Запросить демо".

### Changes in `src/pages/PlatformPresentation.tsx`

1. Wrap "Начать бесплатно" in a `<Link to="/register-organization">` (matching the main landing page behavior)
2. Wrap "Запросить демо" in a `<Link to="/register-organization">` or an anchor/contact action (depending on existing pattern)
3. Import `Link` from `react-router-dom` if not already imported

Both buttons keep their existing styling; we just add navigation.

