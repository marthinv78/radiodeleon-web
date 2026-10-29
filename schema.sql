-- Radio de León — base de datos (Cloudflare D1)
-- Se ejecuta una sola vez al crear la base:  npm run db:init

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT,
  body TEXT,
  category TEXT,
  image TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_pub ON posts (published, published_at);

CREATE TABLE IF NOT EXISTS shows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  host TEXT,
  image TEXT,
  days TEXT,          -- 1=lunes … 7=domingo, separados por coma: "1,2,3,4,5"
  start_time TEXT,    -- "18:00"
  end_time TEXT,      -- "20:00"
  description TEXT,
  sort INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  date TEXT NOT NULL, -- "2026-12-16"
  time TEXT,
  place TEXT,
  image TEXT,
  description TEXT,
  link TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events (date);

CREATE TABLE IF NOT EXISTS sponsors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  logo TEXT,
  url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Notas iniciales (puedes editarlas o borrarlas desde /admin)
INSERT OR IGNORE INTO posts (slug, title, excerpt, category, published, published_at, created_at, updated_at, body) VALUES
('radio-de-leon-regresa', 'Radio de León regresa, ahora por internet',
 'Volvemos al aire con música las 24 horas, desde León para donde estés.', 'La radio', 1,
 '2026-10-29T18:00:00Z', '2026-10-29T18:00:00Z', '2026-10-29T18:00:00Z',
'Radio de León está de regreso. Esta vez no necesitas un aparato de radio: nos escuchas desde el celular, la computadora o tu bocina inteligente, estés en León, en otra ciudad o del otro lado de la frontera.

Arrancamos con música las 24 horas. Nuestro DJ automático elige las canciones y las mezcla para que nunca haya silencio, de día y de madrugada.

## Lo que viene

Muy pronto vamos a sumar programas en vivo con locutores de la ciudad, espacios para artistas leoneses y la posibilidad de que pidas tus canciones desde esta página.

Comparte el enlace con tu familia y tus amigos. **Cada persona que nos escucha nos ayuda a crecer.**'),

('diciembre-suena-a-navidad', 'Diciembre suena a Navidad en Radio de León',
 'Del 1 de diciembre al 6 de enero, más villancicos y música de temporada.', 'Programación', 1,
 '2026-10-29T17:00:00Z', '2026-10-29T17:00:00Z', '2026-10-29T17:00:00Z',
'Del 1 de diciembre al Día de Reyes, la programación de Radio de León se llena de música navideña: villancicos clásicos, versiones instrumentales para la cena y canciones para la posada.

La música de temporada se irá mezclando con nuestra programación de siempre, para que suene a fiesta sin que se vuelva repetitivo.

¿Tienes un villancico favorito? Escríbenos y lo tomamos en cuenta.'),

('haces-musica-en-leon', '¿Haces música en León? Queremos tocarla',
 'Buscamos bandas, solistas, coros y mariachis de la ciudad para sonar en la radio.', 'Comunidad', 1,
 '2026-10-29T16:00:00Z', '2026-10-29T16:00:00Z', '2026-10-29T16:00:00Z',
'Radio de León quiere ser la vitrina de los músicos de la ciudad. Si tienes una banda, eres solista, diriges un coro o tocas con un mariachi, queremos escucharte.

## Cómo participar

Mándanos tus canciones grabadas en MP3 y un mensaje donde nos des permiso de transmitirlas. A cambio, las presentamos al aire con tu nombre y tus redes, y compartimos tu música en nuestras noticias.

No importa el género: rock, regional, cumbia, trova, electrónica o villancicos. Si se hace en León, tiene lugar aquí.'),

('como-escucharnos', 'Cómo escucharnos en el celular, la compu y tu bocina',
 'Tres formas de tener Radio de León siempre a la mano.', 'Ayuda', 1,
 '2026-10-29T15:00:00Z', '2026-10-29T15:00:00Z', '2026-10-29T15:00:00Z',
'**En esta página:** toca el botón de play. La radio sigue sonando aunque cambies de sección, y en el celular la controlas desde la pantalla de bloqueo.

**En una app de radio:** abre VLC u otra app que acepte enlaces de radio y pega este enlace: https://radio.nanostudio.com.mx/listen/radioleon/radio.mp3

**Como app en tu celular:** abre esta página, toca el menú del navegador y elige "Agregar a pantalla de inicio".');

INSERT OR IGNORE INTO settings (key, value) VALUES
('about', 'Radio de León es la radio por internet de León, Guanajuato. Música las 24 horas, noticias de la ciudad y espacio para los artistas leoneses.'),
('whatsapp', ''), ('email', ''), ('facebook', ''), ('instagram', ''), ('tiktok', ''), ('youtube', '');
