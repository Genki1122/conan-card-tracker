# Case Card Catalog Sources

## CT-P11: 2026-10-29

Checked the official [CT-P11 card list](https://www.takaratomy.co.jp/products/conan-cardgame/cardlist/?package=CT-P11), including all four pages of its public `/cardlist/cards?package=CT-P11&page=N` JSON feed (165 printings).

Eight case-card printings represent four distinct card IDs. Each base/parallel pair has the same name, colors, case levels and effect text, so the catalog contains one entry per pair. None of the four names was already in the catalog.

| Card ID | Printings | Official name | Colors | App ID |
| --- | --- | --- | --- | --- |
| 1257 | B11094 / B11094P | ドライマティーニ | 黒 | dry-martini |
| 1261 | B11098 / B11098P | コナンVS怪盗キッド | 青 / 白 | conan-vs-kaito-kid |
| 1262 | B11099 / B11099P | あんた何者や | 緑 / 赤 | who-are-you |
| 1263 | B11100 / B11100P | 警視庁公安部の潜入捜査官 | 黄 / 黒 | mpd-public-security-undercover |

Only names and colors are added, following the existing catalog model. Existing IDs, stored records and usage-based ordering are unchanged. No database migration is required.
