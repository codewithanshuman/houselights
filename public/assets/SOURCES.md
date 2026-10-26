# Houselights artwork

## Purple and white app shell — 26 October 2026

- On 26 October 2026 the owner supplied seven artworks for the landing page (`design/source-assets/brand/landing-page/1.jpg` to `7.jpg`, with `6.png`) and stated the project has the rights to publish them. `brand/landing/art-1.webp` to `art-7.webp` are 440 × 440 centre crops made with Pillow, shown as the image-only card fan on the Booking Desk. They are decorative: not Qloo evidence and not pictures of recommended acts.
- The owner replaced `footer.png` with a pencil drawing of the Golden Gate Bridge. `brand/footer-bridge.webp` (2000 px wide) and `brand/footer-bridge-phone.webp` (a crop around the south tower) are made from it and used as the landing page footer.
- The owner marked the sunflower image `no-use.png`; it is no longer served. The old festival footer, the headline image pills and the earlier card crops were removed from `public/` (they remain in Git history). `brand/concert-hall-band.webp` was removed with the closing call to action.
- `brand/qloo-logo.webp` is a 240 px trimmed copy of the supplied `Qloo-Logo.png`, used only as a "Built with Qloo" attribution in the landing page header badge, the landing footer and the Qloo receipt.
- `brand/record-404.webp` and `brand/record-404-label.webp` are cut from the supplied `404.png` (a turntable). On the 404 page only the label spins, and CSS tints it purple.
- `brand/houselights-logo.webp` (128 px, rounded square) and `brand/favicon-64.png` are made from the owner's new mark `houselights-logo.png` (white wave lines in a circle on a purple gradient). It replaces `portal-logo-v2` in the navigation, sidebar, footer and review page.
- `brand/ticket-blank.webp` (449 × 1120) is a crop of the supplied `ticket-2-landing-page.png`, a blank cream ticket with a red frame, two red bars and a barcode stub; the Booking Desk prints the decision onto it with HTML text positioned inside the frame. `brand/ticket-vinyl.webp` is a trimmed copy of `ticket-1-landing-page.png` (a "Vinyl Night & Jazz" poster ticket), shown beside it as decoration. Neither shows a real event.
- `brand/sticker-headphones.webp` and `brand/sticker-cassette.webp` are trimmed 560 px copies of the supplied `404-elements-1.png` and `404-elements-2.png` (transparent stickers), used only as decoration on the 404 page. The cassette's small stickers are part of the supplied artwork.
- The GitHub mark on the 404 page and in the sidebar is GitHub's published Octicon mark, used only to link to this project's repository.
- Requested typefaces (Gotham, Biski, Lulu Font TH) are not bundled: no font files or licences were supplied, and Gotham is a commercial typeface. The CSS has one variable per role (`--font-ui`, `--font-display`, `--font-hand`), so licensed files can be dropped in later. The sidebar signature uses the visitor's installed script face (Segoe Script, Snell Roundhand and similar).

## Booking Desk landing — 25 October 2026

- On 25 October 2026 the owner supplied four more images and stated the project has the rights to publish them. The originals are kept, unserved, in `design/source-assets/brand/`: `turntable-galaxy.webp`, `flowers-collage.webp`, `sunflower-hand.webp` and `concert-hall.webp`. Three further supplied images were deliberately not used: concert photos of a recognisable real artist (one watermarked) and a real album cover with its title. On a booking product these could read as an endorsement or as recommended acts.
- `brand/cards/{turntable-galaxy,flowers-collage,sunflower-hand}.webp` are 480 × 600 crops, made with Pillow. The turntable crop excludes the album sleeve and its title. `brand/cards/jazz.webp` is a crop of the earlier supplied `jazz.webp`. `brand/concert-hall-band.webp` is a 1200 × 680 crop of the concert hall. All are decorative: they are not Qloo evidence and not photographs of recommended acts.
- On 25 October 2026 the owner replaced those four originals with full-quality PNGs and supplied `footer.png`, a pen-and-ink drawing of a festival crowd, stage and bay. All are kept unserved in `design/source-assets/brand/`. The served crops were regenerated from the PNGs.
  - `brand/footer-festival.webp` (2000 px wide) and `brand/footer-festival-phone.webp` (the stage end, for phones) are crops of `footer.png`, used as the Booking Desk footer.
  - `brand/pill-{turntable,hall,sunflower}.webp` are small crops used as image pills in the headline.
- Not used: `disc-music.gif` shows a real record company's label ("Columbia") and would read as an association. The owner removed the unserved `portal-logo.png` source; `portal-logo-v2.webp` and the favicon were made from it earlier.
- `fonts/geist-variable.woff2` is Geist by Vercel (SIL Open Font License 1.1, `fonts/OFL-geist.txt`), taken from the `geist` npm package version 1.3.1 and subset with fontTools to Latin and the symbols the site uses. It is used only on the Booking Desk.

## Light identity — 21 October 2026

The owner supplied the portal logo and music assets for this redesign. The
larger decorative PNGs were converted to WebP at quality 86 using Pillow;
the original supplied files remain in Git history. Layout, cropping and motion are applied through CSS.
They are decorative artwork, not Qloo evidence or photographs of recommended acts.

| Application asset | Supplied filename |
| --- | --- |
| `brand/portal-logo-v2.png` (source, kept unserved in `design/source-assets/brand/`) | `codex-clipboard-44f9c7c0-42cc-4bc5-83c9-4fda445a4b95.png` |
| `brand/portal-logo-v2.webp` | Resized (216 px) from the `portal-logo-v2.png` source for display |
| `brand/favicon-64.png` | Resized (64 px) from the `portal-logo-v2.png` source for the favicon |
| `brand/record.png` (unused; kept unserved in `design/source-assets/brand/`) | `codex-clipboard-972cc05e-2775-4e43-b0bd-c21efd8123cf.png` |
| `brand/microphone.png` (unused; kept unserved in `design/source-assets/brand/`) | `codex-clipboard-62a2907a-cdb3-448c-924d-095423af4542.png` |
| `brand/disc.webp` | `codex-clipboard-8e049936-7b39-4241-8a90-108722c924c3.png` |
| `brand/camera.webp` | `codex-clipboard-918c0a65-860c-4e88-a662-5c3867df5fad.png` |
| `brand/crowd.webp` | `codex-clipboard-e00958bb-f657-439b-a84c-7c08bf9c3b35.png` |
| `brand/record-frames.webp` | `codex-clipboard-4a0e00c3-9c2e-4fd2-90b0-962e91bf7e9b.png` |
| `brand/jazz.webp` | `codex-clipboard-5d1990b6-7abb-4b7b-98cf-9484453f8c9d.png` |
| `brand/headphones.webp` | `codex-clipboard-92931d7f-cff0-400a-8ec3-b07489e00f81.png` |

The remaining supplied images fill the camera's film windows and the
record's three polaroid frames as decorative collages, not Houselights event
listings. The microphone is retained as an asset but no longer displayed in Slate
Studio. Four supplied reference/poster images — the concert hall, concerto,
Arctic Monkeys and “Music Speaks” — were removed from the public project on
22 October 2026. The code's MIT license does not assert ownership of
the supplied artwork. The project owner attested permission to publish the
remaining supplied artwork on 22 October 2026. Fraunces, IBM Plex Sans and IBM Plex Mono are self-hosted
from Google Fonts; their OFL license files are included in `fonts/`. The served `.woff2` files are lossless format conversions of those `.ttf` files (fontTools), with unchanged font names; the `.ttf` originals are kept, unserved, in `design/source-assets/fonts/`.

The sharper portal logo replaces the earlier `Minimal Geometric Light Portal Logo.png`; its supplied pixels and transparency are preserved. Interface icons are separately attributed in [icons/README.md](icons/README.md).

## Earlier artwork (replaced; retained in Git history)

The five original assets below were supplied by the project owner on 11 October 2026 and copied without visual alteration.

| Application asset | Supplied filename |
| --- | --- |
| `window-light.png` | `codex-clipboard-c7942070-bbb5-4e17-989a-c8568977f729.png` |
| `lighthouse.jpg` | `download (11).jpg` |
| `rain-lantern.gif` | `a086f13b17546c247964e1fad64153c1.gif` |
| `sparkler.png` | `codex-clipboard-6a940613-ecb3-4610-8e9e-2da1a8811bac.png` |
| `lantern.jpg` | `download (12).jpg` |

These are atmospheric product artwork, not photographs of recommended artists or evidence supplied by Qloo. The repository's MIT license covers its code; no ownership of the supplied artwork is asserted.
