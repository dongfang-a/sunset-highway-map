# Sunset Highway · 历史路线地图

**[打开网页地图](https://dongfang-a.github.io/sunset-highway-map/)**

免费托管于 GitHub Pages，直接在浏览器查看，无需安装软件、登录或自己运行服务器。

- 切换 1915、1919 法定路线，或同时对比。
- 显示现存旧路、历史地点、南支线和 Seattle 连接。
- 点击路线查看精度说明、历史备注和来源；路段也支持键盘 Enter 打开说明。
- 下载 [完整 KMZ](downloads/Sunset_Highway_1915_1919_Detailed.kmz) 与 [路线说明](downloads/route-notes.md)。

共 54 个分段、13,673 条坐标记录、28 个历史地点；记录包含替代路线和重叠细节层。年份表示法定走廊，不能视为全线逐米历史测绘。图层颜色区分现存旧路、现代参照及待考证连接。本图用于历史查看，不作为驾驶导航。

## 结构与更新

这是纯静态网页：`index.html`、`styles.css`、`app.js`，以及 `data/`、`downloads/`、`vendor/`。无后台服务、无数据库、无 API 密钥。

GitHub Pages 从 `main` 分支根目录发布；推送更新后自动部署。`.nojekyll` 保留原始静态文件。所有资源使用相对路径，适用于项目站点子目录。

可选的本地预览：`python -m http.server 8765`。这仅用于编辑时预览，公开网站由 GitHub 托管，本地电脑关机后仍可访问。

## 数据与依赖

- 道路数据 © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，适用 ODbL；部分几何经 OSRM 获取。
- Denny Creek / FS58、Homestead Valley 使用 King County 官方 GIS。
- 年代与历史解释来源见路线说明及每个路段弹窗。
- 地图库为 Leaflet 1.9.4，已随站点保存；许可证见 [vendor/LICENSE.txt](vendor/LICENSE.txt)。

底图使用 OpenStreetMap 标准瓦片及浏览器缓存，不提供瓦片预取或离线下载。KMZ 下载包含路线与图例，不包含底图瓦片。
