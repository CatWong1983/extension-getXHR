function encryptAesCbc(plainText) {
    const key = CryptoJS.enc.Utf8.parse('7cc4adla5ay0701v');
    const iv = CryptoJS.enc.Utf8.parse('4uzjr7mbsibcaldp');
    const encrypted = CryptoJS.AES.encrypt(plainText, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    return encrypted.ciphertext.toString();
}

function base64Encode(str) {
    return btoa(str);
}

function generateNewXyw(payload, timestamp) {
    const inputString = `{"signSvn":"56","signType":"x2","appId":"xhs-pc-web","signVersion":"1","payload":"${payload}"}`;
    const encodedPayload = base64Encode(inputString);
    return [`XYW_${encodedPayload}`, timestamp];
}

function keyString(url = "", timestamp = 0, a1 = "") {
    const md5Str = CryptoJS.MD5('url=' + url).toString();
    const environmentStr = `x1=${md5Str};x2=0|0|0|1|0|0|1|0|0|0|1|0|0|0|0|1|0|0|0;x3=${a1};x4=${timestamp};`;
    return base64Encode(environmentStr);
}

// Add export statement
function getXs(url, a1) {
    const timestamp = Date.now();
    const key = keyString(url, timestamp, a1);
    const payload = encryptAesCbc(key);
    const [xs, xt] = generateNewXyw(payload, timestamp);
    return [xs, xt.toString()];
}

window.getXs = getXs;