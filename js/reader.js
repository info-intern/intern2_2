// IroatoReaderのラッパー。実機（IroatoReader管理サイトで端末登録済みの環境）が
// 無い場合でも画面遷移を確認できるよう、簡易的なモックリーダーにフォールバックする。

/**
 * IroatoReaderが利用可能な場合は本物のリーダーを、
 * 利用できない場合はテスト用のモックリーダーを生成する
 */
function createReader(codeType, options) {
    if (typeof IroatoReader !== 'undefined') {
        return new IroatoReader(codeType, options);
    }
    return createMockReader();
}

/**
 * IroatoReader実機が無い環境（PCブラウザでの動作確認など）用の簡易モックリーダー。
 * read()の入出力形式は本物のIroatoReaderに合わせている。
 */
function createMockReader() {
    return {
        read: function (options, callback) {
            const codes = [];
            let continueScan = true;
            while (continueScan) {
                const input = window.prompt(
                    '[モックリーダー] 読み取るコード(1〜100)を入力してください（キャンセルで読取終了）'
                );
                if (input === null) {
                    continueScan = false;
                } else if (input.trim() !== '') {
                    codes.push({ code: input.trim() });
                }
            }
            if (codes.length === 0) {
                callback({ status: false, data: { codes: [] } });
                return;
            }
            callback({ status: true, data: { codes: codes } });
        }
    };
}
