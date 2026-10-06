/* Localized tool information for the retained APNG information route. */
(function () {
  'use strict';
  const copy = {
    zh: {
      brand: '熊酒馆 TRPG 网页工具', title: '文字动画工具说明',
      lead: '为跑团场景制作文字动画，并将生成的图片接入你的网页。',
      back: '← 打开文字图片 APNG 制作器', editTitle: '编辑与导出',
      editBody: '选择消息、预告或地点字幕模板，编辑文字、字体、动画与背景。可导出透明 APNG、当前画面的 PNG，或用于视频编辑的 PNG 序列 ZIP。',
      saveTitle: '浏览器中的工作内容',
      saveBody: '普通制作器在当前浏览器保存编辑设置与导入的字体。嵌入调用使用独立的临时会话，生成结果通过接口返回宿主网页。',
      embedTitle: '接入网页跑团',
      embedBody: '使用 BearTavernApng SDK 配置文字和动画，获取生成进度、取消任务，并接收 APNG 文件。宿主可以把收到的图片显示在游戏场景中。',
      demo: '查看调用演示', api: '查看接口文档', workspace: '工具工作台', fonts: '中文字体来源'
    },
    ja: {
      brand: '熊酒館 TRPG Webツール', title: '文字アニメーションのガイド',
      lead: 'セッションの文字アニメーションを作り、生成画像を Web ページに組み込みます。',
      back: '← 文字画像APNGメーカーを開く', editTitle: '編集と書き出し',
      editBody: 'メッセージ、トレイラー、場所のテンプレートを選び、文章・フォント・動き・背景を編集します。透明 APNG、現在の画面の PNG、映像編集用の PNG 連番 ZIP を書き出せます。',
      saveTitle: 'ブラウザ内の作業内容',
      saveBody: '通常のメーカーは、このブラウザに編集設定と読み込んだフォントを保存します。埋め込み API は独立した一時セッションを使い、生成画像をホストのページに返します。',
      embedTitle: 'Web セッションへの組み込み',
      embedBody: 'BearTavernApng SDK で文章と動きを設定し、進行状況の取得、処理の中止、APNG ファイルの受信ができます。受信画像をゲームの場面に表示できます。',
      demo: '呼び出しデモ', api: 'API ドキュメント', workspace: 'ツール作業台', fonts: '中国語フォントの出典'
    },
    en: {
      brand: 'Bear Tavern TRPG Web Tools', title: 'Text animation guide',
      lead: 'Create text animations for your session and add the generated images to your web page.',
      back: '← Open the Text APNG Maker', editTitle: 'Edit and export',
      editBody: 'Choose a message, trailer or location template, then edit the text, fonts, motion and background. Export a transparent APNG, a PNG of the current frame, or a PNG sequence ZIP for video editing.',
      saveTitle: 'Work saved in your browser',
      saveBody: 'The regular editor stores settings and imported fonts in this browser. Embedded calls use a separate temporary session and return generated images to the host page.',
      embedTitle: 'Embed in a web session',
      embedBody: 'Use the BearTavernApng SDK to configure text and motion, track progress, cancel a task and receive an APNG file. The host can display the returned image in a game scene.',
      demo: 'Open the calling demo', api: 'Read the API documentation', workspace: 'Tool workspace', fonts: 'Chinese font sources'
    },
    ko: {
      brand: '곰 주점 TRPG 웹 도구', title: '문자 애니메이션 안내',
      lead: '세션 장면의 문자 애니메이션을 만들고 생성한 이미지를 웹 페이지에 넣습니다.',
      back: '← 문자 이미지 APNG 메이커 열기', editTitle: '편집과 내보내기',
      editBody: '메시지, 트레일러 또는 장소 템플릿을 고른 뒤 글자, 글꼴, 움직임과 배경을 편집합니다. 투명 APNG, 현재 화면의 PNG, 영상 편집용 PNG 시퀀스 ZIP을 내보낼 수 있습니다.',
      saveTitle: '브라우저에 저장되는 작업',
      saveBody: '일반 메이커는 현재 브라우저에 편집 설정과 가져온 글꼴을 저장합니다. 임베드 호출은 독립적인 임시 세션을 사용하고 생성 이미지를 호스트 페이지로 반환합니다.',
      embedTitle: '웹 세션에 넣기',
      embedBody: 'BearTavernApng SDK로 글자와 움직임을 설정하고 진행 상황을 확인하거나 작업을 취소하며 APNG 파일을 받을 수 있습니다. 호스트에서 받은 이미지를 게임 장면에 표시합니다.',
      demo: '호출 데모 보기', api: 'API 문서 보기', workspace: '도구 작업대', fonts: '중국어 글꼴 출처'
    }
  };
  function apply() {
    const lang = window.TRPGSiteLanguage?.get() || 'zh';
    const text = copy[lang] || copy.zh;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
    document.title = `${text.title} · ${text.brand}`;
    document.querySelector('[name="description"]').content = text.lead;
    document.querySelectorAll('[data-apng-info]').forEach(node => {
      node.textContent = text[node.dataset.apngInfo];
    });
  }
  window.addEventListener('trpg:languagechange', apply);
  apply();
})();
