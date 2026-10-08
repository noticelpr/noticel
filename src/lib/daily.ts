/* =========================================================
   Daily content that changes by itself every day (the site rebuilds hourly):
   horoscope of the day and Trivia NotiCel question of the day.
   ========================================================= */

/** Day number in Puerto Rico (changes at midnight AST). */
export function dayNumber(date = new Date()): number {
  const ymd = date.toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' });
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 864e5);
}

export const todayLong = () =>
  new Date().toLocaleDateString('es-PR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Puerto_Rico' });

/* ---------- Horóscopo (entretenimiento) ---------- */

export const SIGNS = [
  { id: 'aries', name: 'Aries', symbol: '♈', dates: '21 de marzo al 19 de abril' },
  { id: 'tauro', name: 'Tauro', symbol: '♉', dates: '20 de abril al 20 de mayo' },
  { id: 'geminis', name: 'Géminis', symbol: '♊', dates: '21 de mayo al 20 de junio' },
  { id: 'cancer', name: 'Cáncer', symbol: '♋', dates: '21 de junio al 22 de julio' },
  { id: 'leo', name: 'Leo', symbol: '♌', dates: '23 de julio al 22 de agosto' },
  { id: 'virgo', name: 'Virgo', symbol: '♍', dates: '23 de agosto al 22 de septiembre' },
  { id: 'libra', name: 'Libra', symbol: '♎', dates: '23 de septiembre al 22 de octubre' },
  { id: 'escorpio', name: 'Escorpio', symbol: '♏', dates: '23 de octubre al 21 de noviembre' },
  { id: 'sagitario', name: 'Sagitario', symbol: '♐', dates: '22 de noviembre al 21 de diciembre' },
  { id: 'capricornio', name: 'Capricornio', symbol: '♑', dates: '22 de diciembre al 19 de enero' },
  { id: 'acuario', name: 'Acuario', symbol: '♒', dates: '20 de enero al 18 de febrero' },
  { id: 'piscis', name: 'Piscis', symbol: '♓', dates: '19 de febrero al 20 de marzo' },
] as const;

const MESSAGES = [
  'Hoy es buen día para retomar una conversación pendiente con la familia. La paciencia te abrirá puertas.',
  'Organiza tus finanzas antes del fin de semana. Un gasto pequeño evitado hoy te dará tranquilidad mañana.',
  'Alguien cercano necesita tu consejo. Escucha más de lo que hablas y verás cómo ayudas.',
  'Tu esfuerzo en el trabajo comienza a notarse. Mantén el ritmo sin descuidar el descanso.',
  'Una salida al aire libre te recargará las energías. Aprovecha la mañana.',
  'Es momento de cumplir una promesa que hiciste. Tu palabra vale mucho.',
  'Evita decisiones apresuradas en asuntos de dinero. Consulta antes de firmar.',
  'Un detalle sencillo con tu pareja o un amigo hará la diferencia hoy.',
  'Tu creatividad está en su mejor momento. Anota esa idea antes de que se te olvide.',
  'Dedica tiempo a tu salud: camina, toma agua y duerme bien esta noche.',
  'Una noticia del trabajo te sorprenderá para bien. Mantente atento a los mensajes.',
  'Hoy conviene ordenar la casa y la agenda. El orden te dará claridad.',
  'Llama a esa persona mayor de la familia que hace tiempo no visitas. Le alegrarás el día.',
  'No cargues con problemas ajenos. Ayuda, pero pon límites con cariño.',
  'Un reto que parecía grande se resolverá con calma y constancia.',
  'Es buen día para aprender algo nuevo. Un libro o una clase te abrirán caminos.',
  'La gratitud será tu mejor aliada hoy. Reconoce lo que ya tienes.',
  'Comparte una comida con tus seres queridos. Las mejores conversaciones nacen en la mesa.',
  'Alguien te pedirá un favor. Si puedes ayudar, hazlo; la vida te lo devolverá.',
  'Revisa tus metas del mes. Un pequeño ajuste te pondrá de nuevo en ruta.',
  'Tu buen humor contagiará a los demás. Úsalo para unir, no para dividir.',
  'Evita discusiones en las redes sociales. Tu paz vale más que tener la razón.',
] as const;

export type Sign = (typeof SIGNS)[number];
/** Today's message for each sign (changes daily, differs by sign). */
export const horoscope = (signIndex: number, day = dayNumber()) => MESSAGES[(day * 7 + signIndex * 5) % MESSAGES.length];
/** The sign shown on the home page card today. */
export const signOfTheDay = (day = dayNumber()) => SIGNS[day % SIGNS.length];

/* ---------- Trivia NotiCel (one question a day) ---------- */

export const TRIVIA = [
  { q: '¿Qué número usaba Roberto Clemente en su uniforme?', options: ['14', '21', '3', '35'], answer: 1, note: 'Clemente usó el número 21. Los Piratas de Pittsburgh lo retiraron en su honor, y hoy aparece en el logo de La Pro.' },
  { q: '¿Cuántos hits conectó Roberto Clemente en las Grandes Ligas?', options: ['2,500', '3,000', '3,500', '4,000'], answer: 1, note: 'Clemente llegó a 3,000 hits en septiembre de 1972, en su última temporada.' },
  { q: '¿Cuál es la flor nacional de Puerto Rico?', options: ['La amapola', 'La flor de maga', 'La orquídea', 'El flamboyán'], answer: 1, note: 'La flor de maga es la flor nacional de Puerto Rico.' },
  { q: '¿Cuál es el árbol nacional de Puerto Rico?', options: ['El flamboyán', 'La palma real', 'La ceiba', 'El roble'], answer: 2, note: 'La ceiba es el árbol nacional.' },
  { q: '¿Cuál es el punto más alto de Puerto Rico?', options: ['El Yunque', 'Cerro de Punta', 'Monte del Estado', 'Cerro Maravilla'], answer: 1, note: 'Cerro de Punta, en Jayuya, es el punto más alto de la isla.' },
  { q: '¿Cuál es el único bosque tropical lluvioso del sistema de bosques nacionales de Estados Unidos?', options: ['Bosque de Guánica', 'El Yunque', 'Bosque de Maricao', 'Toro Negro'], answer: 1, note: 'El Yunque es el único bosque tropical lluvioso del Sistema de Bosques Nacionales de EE.UU.' },
  { q: '¿En qué isla municipio está la Bahía Mosquito, famosa por su bioluminiscencia?', options: ['Culebra', 'Vieques', 'Mona', 'Caja de Muerto'], answer: 1, note: 'La Bahía Mosquito está en Vieques.' },
  { q: '¿Qué pueblo es conocido como "La Perla del Sur"?', options: ['Guayama', 'Mayagüez', 'Ponce', 'Salinas'], answer: 2, note: 'Ponce es conocida como La Perla del Sur.' },
  { q: '¿Qué pueblo es conocido como "La Ciudad Bruja"?', options: ['Guayama', 'Loíza', 'Aibonito', 'Lares'], answer: 0, note: 'Guayama es conocida como La Ciudad Bruja.' },
  { q: '¿Qué ciudad es conocida como "La Ciudad Criolla"?', options: ['Caguas', 'Bayamón', 'Arecibo', 'Humacao'], answer: 0, note: 'Caguas es conocida como La Ciudad Criolla.' },
  { q: '¿En qué año pasó el huracán María por Puerto Rico?', options: ['2015', '2016', '2017', '2019'], answer: 2, note: 'El huracán María azotó a Puerto Rico el 20 de septiembre de 2017.' },
  { q: '¿Quién ganó la primera medalla de oro olímpica para Puerto Rico?', options: ['Jasmine Camacho-Quinn', 'Mónica Puig', 'Félix Trinidad', 'Javier Culson'], answer: 1, note: 'Mónica Puig ganó el oro en tenis en los Juegos Olímpicos de Río 2016.' },
  { q: '¿En qué prueba ganó Jasmine Camacho-Quinn el oro en Tokio 2020?', options: ['100 metros planos', '400 metros con vallas', '100 metros con vallas', 'Salto largo'], answer: 2, note: 'Camacho-Quinn ganó los 100 metros con vallas.' },
  { q: '¿Qué ley de 1917 otorgó la ciudadanía estadounidense a los puertorriqueños?', options: ['Ley Foraker', 'Ley Jones', 'Ley 600', 'Ley Tydings'], answer: 1, note: 'La Ley Jones de 1917 concedió la ciudadanía estadounidense.' },
  { q: '¿En qué año entró en vigor la Constitución del Estado Libre Asociado?', options: ['1948', '1950', '1952', '1959'], answer: 2, note: 'La Constitución entró en vigor el 25 de julio de 1952.' },
  { q: '¿Con qué pueblo se asocia tradicionalmente la bomba?', options: ['Loíza', 'Utuado', 'Cabo Rojo', 'Aguadilla'], answer: 0, note: 'Loíza es cuna y bastión de la tradición de la bomba.' },
  { q: '¿Cuántas cuerdas tiene el cuatro puertorriqueño?', options: ['4', '6', '10', '12'], answer: 2, note: 'A pesar de su nombre, el cuatro tiene 10 cuerdas en cinco pares.' },
  { q: '¿Cuál es el ingrediente principal del mofongo?', options: ['Yuca', 'Plátano verde', 'Papa', 'Malanga'], answer: 1, note: 'El mofongo se hace con plátano verde frito y majado.' },
  { q: '¿En qué hoja se envuelven tradicionalmente los pasteles?', options: ['Hoja de plátano', 'Hoja de maíz', 'Papel de aluminio', 'Hoja de uva'], answer: 0, note: 'Los pasteles se envuelven en hoja de plátano.' },
  { q: '¿Hacia qué país volaba Roberto Clemente cuando murió en 1972?', options: ['Honduras', 'Nicaragua', 'Guatemala', 'Venezuela'], answer: 1, note: 'Clemente llevaba ayuda a las víctimas del terremoto de Nicaragua.' },
  { q: '¿Cómo se llama oficialmente El Morro?', options: ['Castillo San Cristóbal', 'Fortín San Gerónimo', 'Castillo San Felipe del Morro', 'La Fortaleza'], answer: 2, note: 'Su nombre oficial es Castillo San Felipe del Morro.' },
  { q: '¿Qué es La Fortaleza?', options: ['Un museo de arte', 'La residencia oficial del gobernador', 'Un fuerte en ruinas', 'El Capitolio'], answer: 1, note: 'La Fortaleza es la residencia oficial y sede del gobernador de Puerto Rico.' },
  { q: '¿En qué año colapsó el Radiotelescopio de Arecibo?', options: ['2017', '2018', '2020', '2022'], answer: 2, note: 'La plataforma del radiotelescopio colapsó en diciembre de 2020.' },
  { q: '¿Cuál es el nombre de la liga de béisbol profesional de invierno de Puerto Rico?', options: ['Liga Doble A', 'Liga de Béisbol Profesional Roberto Clemente', 'Liga Atlética Policiaca', 'Liga del Caribe'], answer: 1, note: 'La Liga de Béisbol Profesional Roberto Clemente, conocida como La Pro.' },
  { q: '¿De qué pueblo es el equipo Doble A llamado "Toritos"?', options: ['Cayey', 'Cidra', 'Comerío', 'Barranquitas'], answer: 0, note: 'Los Toritos son de Cayey.' },
] as const;

export const triviaOfTheDay = (day = dayNumber()) => ({ index: day % TRIVIA.length, ...TRIVIA[day % TRIVIA.length] });
