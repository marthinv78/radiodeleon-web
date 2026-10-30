// =============================================================
// Radio de León para Alexa: "Alexa, abre Radio de León"
//
// Amazon manda cada petición a https://radiodeleon.com/alexa.
// Aquí se revisa que de verdad venga de Amazon y se responde con
// la señal en vivo. La configuración de la skill está en alexa/.
//
// Variable opcional: ALEXA_SKILL_ID (el ID de la skill, amzn1.ask.skill...)
// =============================================================

const SERVIDOR = "https://radio.nanostudio.com.mx";
const ESTACION = "radioleon";
const STREAM = `${SERVIDOR}/listen/${ESTACION}/radio.mp3`;
const SITE = "https://radiodeleon.com";
const TOKEN = "radiodeleon-en-vivo";

export async function alexa(req, env) {
  const raw = new Uint8Array(await req.arrayBuffer());
  const why = await fromAmazon(req, raw);
  if (why) return reject(`Firma no válida (${why})`);
  let body;
  try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return reject("Datos inválidos"); }

  // La petición debe ser reciente (Amazon pide máximo 150 segundos)
  if (Math.abs(Date.now() - Date.parse(body.request && body.request.timestamp)) > 150e3) return reject("Petición vencida");
  const appId = (body.session && body.session.application && body.session.application.applicationId)
    || (body.context && body.context.System && body.context.System.application && body.context.System.application.applicationId);
  if (env.ALEXA_SKILL_ID && appId !== env.ALEXA_SKILL_ID) return reject(`Skill no reconocida: ${appId}`);
  console.log("Alexa:", body.request && body.request.type, body.request && body.request.intent && body.request.intent.name);

  return Response.json(await answer(body.request || {}));
}

// El motivo queda en el registro de Cloudflare (Workers → radiodeleon-web → Logs)
function reject(msg) {
  console.warn("Alexa rechazada:", msg);
  return new Response(msg, { status: 400 });
}

async function answer(r) {
  const type = r.type || "";
  if (type === "LaunchRequest") return play("Aquí está Radio de León. Tu música, tus recuerdos.");
  if (type === "IntentRequest") {
    switch (r.intent && r.intent.name) {
      case "PonerRadioIntent":
      case "AMAZON.ResumeIntent":
      case "AMAZON.StartOverIntent":
      case "AMAZON.YesIntent":
        return play(r.intent.name === "AMAZON.ResumeIntent" ? "" : "Aquí está Radio de León.");
      case "QueSuenaIntent":
        return say(await nowPlaying());
      case "AMAZON.PauseIntent":
      case "AMAZON.StopIntent":
      case "AMAZON.CancelIntent":
      case "AMAZON.NoIntent":
      case "AMAZON.NavigateHomeIntent":
        return stop();
      case "AMAZON.HelpIntent":
        return say("Con Radio de León escuchas nuestra señal en vivo desde León, Guanajuato. Puedes decir: pon la radio, qué canción es, o detente. ¿Quieres escucharla ahora?", false);
      case "AMAZON.NextIntent":
      case "AMAZON.PreviousIntent":
      case "AMAZON.RepeatIntent":
      case "AMAZON.LoopOnIntent":
      case "AMAZON.LoopOffIntent":
      case "AMAZON.ShuffleOnIntent":
      case "AMAZON.ShuffleOffIntent":
        return say("Radio de León es una transmisión en vivo, así que no se puede adelantar ni repetir.");
      default:
        return say("No te entendí. Puedes decir: pon la radio, o: qué canción es. ¿Quieres escuchar Radio de León?", false);
    }
  }
  // Botones de reproducción del dispositivo
  if (type === "PlaybackController.PlayCommandIssued") return play("");
  if (type === "PlaybackController.PauseCommandIssued") return stop();
  // Avisos del reproductor y fin de sesión: no requieren respuesta
  return { version: "1.0", response: {} };
}

const say = (text, end = true) => ({
  version: "1.0",
  response: { outputSpeech: { type: "PlainText", text }, shouldEndSession: end },
});
function play(text) {
  const res = {
    version: "1.0",
    response: {
      shouldEndSession: true,
      directives: [{
        type: "AudioPlayer.Play",
        playBehavior: "REPLACE_ALL",
        audioItem: {
          stream: { url: STREAM, token: TOKEN, offsetInMilliseconds: 0 },
          metadata: {
            title: "Radio de León",
            subtitle: "Tu música, tus recuerdos",
            art: { sources: [{ url: `${SITE}/brand/alexa-512.png` }] },
            backgroundImage: { sources: [{ url: `${SITE}/brand/tunein-portada-2000x600.jpg` }] },
          },
        },
      }],
    },
  };
  if (text) res.response.outputSpeech = { type: "PlainText", text };
  return res;
}
const stop = () => ({ version: "1.0", response: { shouldEndSession: true, directives: [{ type: "AudioPlayer.Stop" }] } });

async function nowPlaying() {
  try {
    const r = await fetch(`${SERVIDOR}/api/nowplaying/${ESTACION}`);
    const s = ((await r.json()).now_playing || {}).song || {};
    if (s.title) return `Está sonando ${s.title}${s.artist ? `, de ${s.artist}` : ""}.`;
  } catch {}
  return "Ahora no puedo saber qué canción suena, pero la radio sigue al aire.";
}

// ---------------------------------------------------------------
// Revisar que la petición la firmó Amazon
// https://developer.amazon.com/docs/custom-skills/host-a-custom-skill-as-a-web-service.html
// ---------------------------------------------------------------
const certs = new Map();

// Devuelve "" si la petición la firmó Amazon, o el motivo si no
async function fromAmazon(req, raw) {
  const certUrl = req.headers.get("SignatureCertChainUrl") || "";
  const sig = req.headers.get("Signature-256") || "";
  if (!certUrl || !sig) return "faltan encabezados";
  if (!validCertUrl(certUrl)) return `certificado en lugar no permitido: ${certUrl}`;
  try {
    let key = certs.get(certUrl);
    if (!key) {
      const pem = await (await fetch(certUrl)).text();
      const leaf = pemToDer(pem);
      if (!leaf) return "no se pudo leer el certificado";
      const { notBefore, notAfter, spki } = parseCert(leaf);
      const now = Date.now();
      if (now < notBefore || now > notAfter) return "certificado vencido";
      // El certificado debe ser el de Amazon para Alexa
      if (!hasText(leaf, "echo-api.amazon.com")) return "el certificado no es de Alexa";
      key = { key: await crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]), notAfter };
      certs.set(certUrl, key);
    }
    if (Date.now() > key.notAfter) { certs.delete(certUrl); return "certificado vencido"; }
    return (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key.key, b64(sig), raw)) ? "" : "la firma no coincide";
  } catch (e) { return `error al revisar: ${e.message}`; }
}

// Busca un texto simple (ASCII) dentro de los bytes del certificado
function hasText(bytes, text) {
  const t = [...text].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= bytes.length - t.length; i++) {
    for (let k = 0; k < t.length; k++) if (bytes[i + k] !== t[k]) continue outer;
    return true;
  }
  return false;
}

function validCertUrl(u) {
  let url;
  try { url = new URL(u); } catch { return false; }
  return url.protocol === "https:" && url.hostname.toLowerCase() === "s3.amazonaws.com"
    && url.pathname.startsWith("/echo.api/") && (url.port === "" || url.port === "443");
}

const b64 = (s) => Uint8Array.from(atob(s.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
// El primer certificado del archivo es el de Amazon; los demás son la cadena
function pemToDer(pem) {
  const m = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
  return m ? b64(m[1]) : null;
}

// Lectura mínima de un certificado X.509 (formato DER): vigencia y llave pública
function tlv(b, i) {
  let len = b[i + 1], hdr = 2;
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let k = 0; k < n; k++) len = len * 256 + b[i + 2 + k]; hdr = 2 + n; }
  return { tag: b[i], start: i + hdr, end: i + hdr + len, from: i };
}
function kids(b, node) {
  const out = [];
  for (let i = node.start; i < node.end;) { const k = tlv(b, i); out.push(k); i = k.end; }
  return out;
}
function asn1Time(b, node) {
  const s = new TextDecoder().decode(b.slice(node.start, node.end));
  const full = node.tag === 0x17 ? (Number(s.slice(0, 2)) < 50 ? "20" : "19") + s : s;
  return Date.UTC(+full.slice(0, 4), +full.slice(4, 6) - 1, +full.slice(6, 8), +full.slice(8, 10), +full.slice(10, 12), +full.slice(12, 14));
}
function parseCert(b) {
  const tbs = kids(b, tlv(b, 0))[0];
  const f = kids(b, tbs);
  const off = f[0].tag === 0xa0 ? 1 : 0;
  const [nb, na] = kids(b, f[off + 3]);
  const spki = f[off + 5];
  return { notBefore: asn1Time(b, nb), notAfter: asn1Time(b, na), spki: b.slice(spki.from, spki.end) };
}
