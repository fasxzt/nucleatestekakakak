# nucleatestekakakak

coisa legal AQ.Ab8RN6LziqlKYPaHuUpTn3tLah2-zGkrzK38lAquHSGNjxl45w

estou tendo erro com o reCAPTCHA do app check da firebase, no caso, quando apertamos pra logar no dominio da vercel ele da esse erro:

logger.ts:115 [2026-09-24T14:22:03.731Z]  @firebase/app-check: FirebaseError: AppCheck: ReCAPTCHA error. (appCheck/recaptcha-error).
    at ve.getToken (providers.ts:79:27)
    at async ee (internal-api.ts:156:5)
    at async Be._getAppCheckToken (auth_impl.ts:694:11)
    at async Be._getAdditionalHeaders (auth_impl.ts:685:11)
    at async index.ts:129:11
    at async ie (index.ts:157:11)
    at async ve (reload.ts:34:9)
    at async _e._fromIdTokenResponse (user_impl.ts:334:5)
    at async wt._fromIdTokenResponse (user_credential_impl.ts:53:11)
    at async Pt (credential.ts:42:9)
(anonymous) @ logger.ts:115
logger.ts:115 [2026-09-24T14:22:03.731Z]  @firebase/auth: Auth (9.23.0): Error while retrieving App Check token: FirebaseError: AppCheck: ReCAPTCHA error. (appCheck/recaptcha-error).
(anonymous) @ logger.ts:115
popup.ts:289 Cross-Origin-Opener-Policy policy would block the window.closed call.
(anonymous) @ popup.ts:289
popup.ts:289 Cross-Origin-Opener-Policy policy would block the window.closed call.
(anonymous) @ popup.ts:289
logger.ts:115 [2026-09-24T14:22:06.807Z]  @firebase/app-check: FirebaseError: AppCheck: ReCAPTCHA error. (appCheck/recaptcha-error).
    at ve.getToken (providers.ts:79:27)
    at async ee (internal-api.ts:156:5)
    at async Be._getAppCheckToken (auth_impl.ts:694:11)
    at async Be._getAdditionalHeaders (auth_impl.ts:685:11)
    at async index.ts:129:11
    at async ie (index.ts:157:11)
    at async se (index.ts:216:9)
    at async anonymous.ts:47:9
(anonymous) @ logger.ts:115
logger.ts:115 [2026-09-24T14:22:06.807Z]  @firebase/auth: Auth (9.23.0): Error while retrieving App Check token: FirebaseError: AppCheck: ReCAPTCHA error. (appCheck/recaptcha-error).
(anonymous) @ logger.ts:115
logger.ts:115 [2026-09-24T14:22:07.338Z]  @firebase/app-check: FirebaseError: AppCheck: ReCAPTCHA error. (appCheck/recaptcha-error).
    at ve.getToken (providers.ts:79:27)
    at async ee (internal-api.ts:156:5)
    at async Be._getAppCheckToken (auth_impl.ts:694:11)
    at async Be._getAdditionalHeaders (auth_impl.ts:685:11)
    at async index.ts:129:11
    at async ie (index.ts:157:11)
    at async ve (reload.ts:34:9)
    at async _e._fromIdTokenResponse (user_impl.ts:334:5)
    at async wt._fromIdTokenResponse (user_credential_impl.ts:53:11)
    at async anonymous.ts:50:9
(anonymous) @ logger.ts:115
logger.ts:115 [2026-09-24T14:22:07.339Z]  @firebase/auth: Auth (9.23.0): Error while retrieving App Check token: FirebaseError: AppCheck: ReCAPTCHA error. (appCheck/recaptcha-error).
(anonymous) @ logger.ts:115
logger.ts:115 [2026-09-24T14:22:59.783Z]  @firebase/app-check: FirebaseError: AppCheck: ReCAPTCHA error. (appCheck/recaptcha-error).
    at ve.getToken (providers.ts:79:27)
    at async ee (internal-api.ts:156:5)
    at async P.operation (internal-api.ts:328:43)
    at async P.process (proactive-refresh.ts:76:26)
(anonymous) @ logger.ts:115
proactive-refresh.ts:54 Uncaught (in promise) cancelled
logger.ts:115 [2026-09-24T14:24:59.777Z]  @firebase/app-check: FirebaseError: AppCheck: ReCAPTCHA error. (appCheck/recaptcha-error).
    at ve.getToken (providers.ts:79:27)
    at async ee (internal-api.ts:156:5)
    at async P.operation (internal-api.ts:328:43)
    at async P.process (proactive-refresh.ts:76:26)
(anonymous) @ logger.ts:115
error @ logger.ts:210
getToken @ internal-api.ts:163
await in getToken
(anonymous) @ internal-api.ts:326
process @ proactive-refresh.ts:77
proactive-refresh.ts:54 Uncaught (in promise) cancelled
