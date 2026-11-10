# 妮妮的豆豆大戰：豆豆圖示

主角是綠、紅、藍三顆微笑豆豆，背景配合遊戲的深藍配色。

| 檔案 | 用途 |
| --- | --- |
| `doudou-icon.png` | 內建 image_gen 生成的原圖，1254 × 1254 px |
| `doudou-icon-32.png` | 32 × 32 px 瀏覽器分頁圖示 |
| `doudou-icon-180.png` | 180 × 180 px 手機主畫面圖示，並用於頁面標題旁 |
| `doudou-icon-512.png` | 512 × 512 px 網頁分享圖片 |
| `doudou.ico` | 包含 16／32／48 px 的多尺寸瀏覽器圖示 |

使用內建 image_gen 產生原圖，再以 Pillow 等比例輸出各尺寸與 ICO 格式。沒有使用 CLI 或外部付費 API 金鑰。衍生檔保留完整構圖，沒有裁切或重畫內容。

## 生成提示詞

```text
Use case: logo-brand. Asset type: square website and mobile home-screen icon for a colorful five-in-a-row ball puzzle game named 妮妮的豆豆大戰. Generate one polished, friendly app icon, no lettering or numbers anywhere. Subject: a charming round mint-green jelly bean / pea ball character with a very simple happy face and tiny pink cheek accents, accompanied by two smaller smooth coral-red and sky-blue round jelly beans, a compact recognizable trio. These are cute game balls, not human characters. Style: premium playful soft 3D clay / glossy jelly illustration, smooth chunky forms, clean silhouette, restrained highlights, very few details, visually readable as a 32 px favicon. Composition: a single centered icon with the trio filling most of the square, comfortable 8% safe margin, no surrounding mockup, no icon sheets, no extra objects, no crown, no weapons. Background: solid deep navy #1a1a2e matching the game's dark blue UI, edge-to-edge square canvas. Soft upper-left light, cheerful and welcoming. No text, no watermark, no border. Produce a crisp 1024 by 1024 square image.
```

## 授權

圖示隨專案採用 [PolyForm Noncommercial License 1.0.0](../LICENSE.md)。

Required Notice: Copyright (c) 2026 M80ta
