// =============================================================
// Radio de León para Alexa (versión alojada por Amazon, "Alexa-hosted")
//
// Este archivo se pega en la consola de Alexa: pestaña Code → lambda/index.js
// y luego Deploy. Amazon lo corre y revisa las firmas por su cuenta.
// Si cambia la dirección de la señal, cámbiala aquí abajo y dale Deploy.
// =============================================================

const https = require("https");

const SERVIDOR = "https://radio.nanostudio.com.mx";
const ESTACION = "radioleon";
const STREAM = `${SERVIDOR}/listen/${ESTACION}/radio.mp3`;
const SITE = "https://radiodeleon.com";
const TOKEN = "radiodeleon-en-vivo";

exports.handler = async (event) => {
  const r = event.request || {};
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
};

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

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on("timeout", () => req.destroy(new Error("tiempo agotado")));
    req.on("error", reject);
  });
}

async function nowPlaying() {
  try {
    const s = ((await getJson(`${SERVIDOR}/api/nowplaying/${ESTACION}`)).now_playing || {}).song || {};
    if (s.title) return `Está sonando ${s.title}${s.artist ? `, de ${s.artist}` : ""}.`;
  } catch (e) {}
  return "Ahora no puedo saber qué canción suena, pero la radio sigue al aire.";
}
