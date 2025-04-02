import base64
import hashlib
import random
import time

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

def encrypt_aes_cbc(plain_text):
    key = '7cc4adla5ay0701v'.encode('utf-8')  # 固定密钥
    iv = '4uzjr7mbsibcaldp'.encode('utf-8')  # 固定IV
    cipher = AES.new(key, AES.MODE_CBC, iv)
    encrypted = cipher.encrypt(pad(plain_text.encode('utf-8'), AES.block_size))
    return encrypted.hex()

def base64_encode(input_str):
    return base64.b64encode(input_str.encode('utf-8')).decode('utf-8')

def generate_new_xyw(payload, timestamp):
    # input_string = json.dumps({
    #     "signSvn":"56",
    #     "signType":"x2",
    #     "appId":"xhs-pc-web",
    #     "signVersion":"1",
    #     "payload":payload
    # })
    input_string = f'{{"signSvn":"56","signType":"x2","appId":"xhs-pc-web","signVersion":"1","payload":"{payload}"}}'
    encoded_payload = base64_encode(input_string)
    # return {
    #     "X-s": "XYW_" + encoded_payload,
    #     "X-t": timestamp
    # }
    return  f"XYW_{encoded_payload}", timestamp

def key_string(url="",timestamp=0, a1=""):
    md5_str = hashlib.md5(f'url={url}'.encode('utf-8')).hexdigest()
    environment_str = f"x1={md5_str};x2=0|0|0|1|0|0|1|0|0|0|1|0|0|0|0|1|0|0|0;x3={a1};x4={timestamp};"
    return base64_encode(environment_str)

def get_xs(url,a1):
    timestamp = int(time.time() * 1000)
    # timestamp = 1740020924369
    key = key_string(url, timestamp, a1)
    payload = encrypt_aes_cbc(key)
    xs,xt = generate_new_xyw(payload, timestamp)
    return xs,str(xt)

# def u():
#     timestamp = int(time.time() * 1000)
#     random_num = random.randint(0, 2147483646)
#     high = timestamp * (2 ** 32)
#     result = high + random_num
#     return base36_encode(result)

# def us():
#     return f"{u()}@{u()}"

def base36_encode(number):
    chars = '0123456789abcdefghijklmnopqrstuvwxyz'
    result = ''
    while number > 0:
        number, i = divmod(number, 36)
        result = chars[i] + result
    return result or '0'


if __name__ == '__main__':
    params_key = '/api/sns/web/v2/comment/sub/page?note_id=67e636be000000001203f564&root_comment_id=67e65d2b000000001f004b5c&num=10&cursor=67e6b515000000001e038f0a&image_formats=jpg,webp,avif&top_comment_id=&xsec_token=KBFsBTwzQ-uQaKmGh9rjIqFLQ9d5zney3FFHQE16q7aRY%3D'
    # params_key ='/api/sns/web/v2/feed{"source_note_id":"67e636be000000001203f564","image_formats":["jpg","webp","avif"],"extra":{"need_body_topic":"1"},"xsec_source":"pc_ad","xsec_token":"KBFsBTwzQ-uQaKmGh9rjIqFLQ9d5zney3FFHQE16q7aRY%3D"}'
    a1 ="1954623fe52k7f6segccstft6ignu5wbl2cd4umkp30000112782"
    xs,xt = get_xs(params_key,a1)
    print("生成x-s加密参数值: {},{}".format(xs,xt))



# // 添加 Cookie 管理函数
# async function manageCookies() {
#   try {
#     // 1. 清理旧的 Cookie
#     await chrome.cookies.remove({
#       url: "https://edith.xiaohongshu.com",
#       name: "sessionid"
#     });

#     // 2. 设置必要的 Cookies
#     const cookies = [
#       {
#         name: "a1",
#         value: "1954623fe52k7f6segccstft6ignu5wbl2cd4umkp30000112782"
#       },
#       {
#         name: "webId",
#         value: "679150ea5864e6684317e3eb8a289761"
#       },
#       {
#         name: "gid",
#         value: "yj24KJ484j1iyj24KJqidJ762JTWiKMdkSSMSTU9i9K3kfq8I72ED4888yyJWYJ8ydKdWK0q"
#       },
#       {
#         name: "x-user-id-ad.xiaohongshu.com",
#         value: "67b5a91404f0000000000001"
#       },
#       {
#         name: "customerClientId",
#         value: "898486601331467"
#       },
#       {
#         name: "x-user-id-ad-market.xiaohongshu.com",
#         value: "67b5a91404f0000000000001"
#       },
#       {
#         name: "access-token-ad-market.xiaohongshu.com",
#         value: "customer.ad_market.AT-68c517475985715453335642qnxbt564ju3syiap"
#       },
#       {
#         name: "x-user-id-partner.xiaohongshu.com",
#         value: "67b5a91404f0000000000001"
#       },
#       {
#         name: "abRequestId",
#         value: "679150ea5864e6684317e3eb8a289761"
#       },
#       {
#         name: "webBuild",
#         value: "4.60.1"
#       },
#       {
#         name: "customer-sso-sid",
#         value: "68c517483050404079425320nswnbnlnlrglafuw"
#       },
#       {
#         name: "ares.beaker.session.id",
#         value: "1742283454579049065443"
#       },
#       {
#         name: "access-token-ad.xiaohongshu.com",
#         value: "customer.leona.AT-74b4a0fa84804dd690e923e88259fb69-54cf02ecc2d34c098121cecae0cd617d"
#       },
#       {
#         name: "x-user-id-fankui-out.xiaohongshu.com",
#         value: "67b5a91404f0000000000001"
#       },
#       {
#         name: "web_session",
#         value: "0400698cd51570566fff52efef354b233a21fe"
#       },
#       {
#         name: "xsecappid",
#         value: "xhs-pc-web"
#       },
#       {
#         name: "acw_tc",
#         value: "0a0bb31817424403604148528e0591d44995906b787a1394857b27202c064a"
#       },
#       {
#         name: "websectiga",
#         value: "634d3ad75ffb42a2ade2c5e1705a73c845837578aeb31ba0e442d75c648da36a"
#       },
#       {
#         name: "sec_poison_id",
#         value: "3c68b8e7-f875-4699-9335-c10d4e28a467"
#       },
#       {
#         name: "unread",
#         value: "{%22ub%22:%2267d3b0f00000000007035d70%22%2C%22ue%22:%2267dace86000000000603bb9e%22%2C%22uc%22:25}"
#       },
#       {
#         name: "loadts",
#         value: "1742441697553"
#       }
#     ];

#     for (const cookie of cookies) {
#       await chrome.cookies.set({
#         url: "https://edith.xiaohongshu.com/",
#         name: cookie.name,
#         value: cookie.value,
#         domain: "edith.xiaohongshu.com",
#         path: "/",
#         secure: false,
#         httpOnly: false
#       });
#     }
#   } catch (error) {
#     console.error('Cookie 管理失败:', error);
#   }
# }
