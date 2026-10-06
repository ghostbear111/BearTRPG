# 熊酒馆文字 APNG 中文字体

制作器在“字体”页提供 9 款在线中文字体和 3 组本机中文字体候选。中文界面优先排列中文字体，主文本与副文本都可选择；旧的字体 ID、用户字体注册和已有作品设置继续兼容。

## 在线中文字体

下表的中文名称用于界面显示，实际请求使用英文 family。新增的 7 款字体均从 Google Fonts 官方 `METADATA.pb` 核实名称、400 字重、简体字子集与 OFL 标记；许可文件是 SIL Open Font License 1.1。

| 界面名称 | family / 调用 ID | 风格 | 可选字重 | 官方元数据与许可 |
| --- | --- | --- | --- | --- |
| 思源黑体（简体） | `Noto Sans SC` / `noto-sans-sc` | 黑体 | 400 / 700 / 900 | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/notosanssc) |
| 思源宋体（简体） | `Noto Serif SC` / `noto-serif-sc` | 宋体 | 400 / 700 / 900 | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/notoserifsc) |
| 站酷庆科黄油体 | `ZCOOL QingKe HuangYou` / `zcool-qingke-huangyou` | 窄身标题 | 400 | [元数据](https://github.com/google/fonts/blob/main/ofl/zcoolqingkehuangyou/METADATA.pb) · [OFL](https://github.com/google/fonts/blob/main/ofl/zcoolqingkehuangyou/OFL.txt) |
| 站酷快乐体 | `ZCOOL KuaiLe` / `zcool-kuaile` | 活泼、圆润 | 400 | [元数据](https://github.com/google/fonts/blob/main/ofl/zcoolkuaile/METADATA.pb) · [OFL](https://github.com/google/fonts/blob/main/ofl/zcoolkuaile/OFL.txt) |
| 站酷小薇体 | `ZCOOL XiaoWei` / `zcool-xiaowei` | 装饰标题 | 400 | [元数据](https://github.com/google/fonts/blob/main/ofl/zcoolxiaowei/METADATA.pb) · [OFL](https://github.com/google/fonts/blob/main/ofl/zcoolxiaowei/OFL.txt) |
| 马善政毛笔楷书 | `Ma Shan Zheng` / `ma-shan-zheng` | 毛笔楷书 | 400 | [元数据](https://github.com/google/fonts/blob/main/ofl/mashanzheng/METADATA.pb) · [OFL](https://github.com/google/fonts/blob/main/ofl/mashanzheng/OFL.txt) |
| 刘建毛草 | `Liu Jian Mao Cao` / `liu-jian-mao-cao` | 草书 | 400 | [元数据](https://github.com/google/fonts/blob/main/ofl/liujianmaocao/METADATA.pb) · [OFL](https://github.com/google/fonts/blob/main/ofl/liujianmaocao/OFL.txt) |
| 龙藏手写体 | `Long Cang` / `long-cang` | 自然手写 | 400 | [元数据](https://github.com/google/fonts/blob/main/ofl/longcang/METADATA.pb) · [OFL](https://github.com/google/fonts/blob/main/ofl/longcang/OFL.txt) |
| 志莽行书 | `Zhi Mang Xing` / `zhi-mang-xing` | 行书 | 400 | [元数据](https://github.com/google/fonts/blob/main/ofl/zhimangxing/METADATA.pb) · [OFL](https://github.com/google/fonts/blob/main/ofl/zhimangxing/OFL.txt) |

字形按当前文本加载；字体面板只为可见样例获取小型子集，不预下载完整字库。“样例已加载”表示字体卡片可预览，并不表示所有汉字都已缓存。七款新增在线字体只提供原生 400 字重，不在字重菜单中宣称额外粗细可用。

## 无网络时

| 调用 ID | 界面名称 | 字体候选顺序 |
| --- | --- | --- |
| `system-sans` | 本机黑体 / 无衬线 | 系统界面字体、微软雅黑、苹方、通用无衬线 |
| `system-serif` | 本机宋体 / 衬线 | 宋体 SC、宋体、通用衬线 |
| `system-zh-kai` | 本机楷体 | KaiTi、STKaiti、Kaiti SC、DFKai-SB、宋体、通用衬线 |
| `system-zh-fangsong` | 本机仿宋 | FangSong、STFangsong、FangSong_GB2312、宋体、通用衬线 |
| `system-zh-rounded` | 本机幼圆 | YouYuan、Yuanti SC、微软雅黑、苹方、通用无衬线 |

本机候选没有附带字库，不保证设备已安装某个具体字体；浏览器会沿候选顺序选择可用字体。缺少楷体、仿宋或幼圆时，最终字形可能变成普通宋体或黑体。制作器也支持输入其他已安装的字体名称，或添加 TTF / OTF / WOFF / WOFF2 文件。

在线字体无法加载时仍可使用备用字体生成 APNG，页面会给出提示。字体覆盖不完整的生僻字会使用后备字体，实际显示由设备和字体字形覆盖决定。

## 嵌入调用

上述 ID 均可用于 `BearTavernApng` 的 `configure` / `render` 的 `fontId`。需要确定字形样式时选择在线字体并确认网络可用；需要完全离线时选择 `system-*` 候选或在嵌入编辑器中添加字体文件。嵌入 API 会话中的用户字体只保留在当前会话，不读写普通制作器的私有字体存档。

```js
const result = await maker.render({
  text: '熊酒馆 · 冒险启程',
  fontId: 'ma-shan-zheng',
  fontWeight: 400,
  width: 720,
  height: 240
});
```

接入协议和完整参数见 [APNG 模块文档](./apng-module.md)。
