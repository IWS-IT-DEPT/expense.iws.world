# Brand assets

| File | Source | Notes |
| ---- | ------ | ----- |
| `company-logos.png` | supplied contact sheet | 3×2 grid of all six company logos, on white. The slice script's source. |
| `iws.png` | supplied | IWS app icon, transparent. Used for the header, sign-in, and favicon (`app/icon.png`). |
| `pre.png` `port.png` `rgt.png` `rgl.png` `ggb.png` `iws-wordmark.png` | sliced from `company-logos.png` | White background (the sheet has no transparency). Trimmed to content. |

## Regenerating the slices

```
node scripts/analyze-logos.mjs   # prints the grid bounds
node scripts/slice-logos.mjs     # writes the per-entity PNGs
```

Edit `COLS` / `ROWS` in `scripts/slice-logos.mjs` if you replace the contact sheet.

## Getting better assets

The sliced PNGs are white-background raster. For crisp logos in dark mode and at
any size, replace each `<code>.png` with a **transparent PNG or SVG** exported
from the original brand files. Keep the filenames — `db/seed.ts` and
`lib/brand.ts` reference them by path.

Entity → file mapping: `IWS→iws.png`, `PRE→pre.png`, `PORT→port.png`,
`RGT→rgt.png`, `RGL→rgl.png`, `GGB→ggb.png`.
