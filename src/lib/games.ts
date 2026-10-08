/* Juegos NotiCel: the list shown on /juegos, in the home strip pop-out and in the games teaser.
   Every game runs in the reader's browser; progress is kept only on their device.
   `cat` is the kind of game (palabras, mente, mesa). */
export const GAMES = [
  { id: 'crucigrama', name: 'Crucigrama del día', icon: '✎', color: '#0E5BA8', cat: 'palabras', about: 'Un crucigrama boricua nuevo cada día.' },
  { id: 'trivia', name: 'Trivia NotiCel', icon: '?', color: '#2B1185', cat: 'palabras', about: 'Una pregunta diaria sobre Puerto Rico.' },
  { id: 'palabra', name: 'Palabra NotiCel', icon: 'Ñ', color: '#1F90DA', cat: 'palabras', about: 'Adivina la palabra del día en seis intentos.' },
  { id: 'sopa', name: 'Sopa de letras', icon: 'A', color: '#C2410C', cat: 'palabras', about: 'Busca seis palabras bien boricuas.' },
  { id: 'sudoku', name: 'Sudoku del día', icon: '9', color: '#7C3AED', cat: 'mente', about: 'Un sudoku nuevo cada día, en tres niveles.' },
  { id: 'memoria', name: 'Memoria Boricua', icon: '◆', color: '#0E8A5F', cat: 'mente', about: 'Encuentra las parejas en la menor cantidad de jugadas.' },
  { id: 'domino', name: 'Dominó', icon: '⚃', color: '#14111F', cat: 'mesa', about: 'Mano a mano o en parejas de cuatro. Partida a 100.' },
  { id: 'cuatro-colores', name: 'Cuatro Colores', icon: '+4', color: '#D7263D', cat: 'mesa', about: 'Combina color o número y quédate sin cartas primero.' },
  { id: 'ahorcado', name: 'Ahorcado boricua', icon: 'Á', color: '#B45309', cat: 'palabras', about: 'Adivina la palabra boricua letra por letra.' },
  { id: '2048', name: '2048', icon: '2K', color: '#C2185B', cat: 'mente', about: 'Une los números iguales hasta llegar a 2048.' },
  { id: 'cuatro-en-linea', name: 'Cuatro en Línea', icon: '●', color: '#E8A400', cat: 'mesa', about: 'Conecta cuatro fichas antes que la computadora.' },
] as const;


/** The featured game on the games page: the daily crossword */
export const FEATURED_GAME = GAMES[0];
