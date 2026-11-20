/** 交信文を作るための素材 */

/** JA のコールエリア (数字) ごとの都市名。コールサインの数字と QTH が食い違わないようにする。 */
export const JA_AREA_CITIES: Readonly<Record<string, readonly string[]>> = {
  '0': ['NIIGATA', 'NAGANO', 'MATSUMOTO', 'NAGAOKA', 'UEDA'],
  '1': ['TOKYO', 'YOKOHAMA', 'CHIBA', 'SAITAMA', 'KAWASAKI', 'FUNABASHI', 'KASHIWA', 'MITO', 'UTSUNOMIYA', 'MAEBASHI', 'KOFU', 'NARITA', 'TSUKUBA', 'MATSUDO'],
  '2': ['NAGOYA', 'SHIZUOKA', 'HAMAMATSU', 'GIFU', 'TSU', 'TOYOTA', 'NUMAZU'],
  '3': ['OSAKA', 'KYOTO', 'KOBE', 'NARA', 'OTSU', 'WAKAYAMA', 'SAKAI', 'HIMEJI'],
  '4': ['HIROSHIMA', 'OKAYAMA', 'MATSUE', 'TOTTORI', 'YAMAGUCHI', 'KURASHIKI'],
  '5': ['TAKAMATSU', 'MATSUYAMA', 'TOKUSHIMA', 'KOCHI', 'IMABARI'],
  '6': ['FUKUOKA', 'KUMAMOTO', 'KAGOSHIMA', 'NAGASAKI', 'OITA', 'MIYAZAKI', 'SAGA', 'NAHA'],
  '7': ['SENDAI', 'AOMORI', 'MORIOKA', 'AKITA', 'YAMAGATA', 'FUKUSHIMA', 'KORIYAMA'],
  '8': ['SAPPORO', 'ASAHIKAWA', 'HAKODATE', 'KUSHIRO', 'OBIHIRO', 'OTARU'],
  '9': ['KANAZAWA', 'TOYAMA', 'FUKUI', 'TAKAOKA'],
};

export const JA_NAMES: readonly string[] = [
  'TARO', 'HIRO', 'KEN', 'YUKI', 'AKI', 'MASA', 'TAKA', 'SHIN', 'KOJI', 'NAO', 'JUN', 'MAKOTO', 'OSAMU',
  'SATOSHI', 'TOSHI', 'KAZU', 'YOSHI', 'HIDE', 'TETSU', 'NOBU', 'ISAO', 'MINORU', 'SHIGE', 'TORU',
  'KIYOSHI', 'HARU', 'RYO', 'SHO', 'DAI', 'YUTA', 'KENJI', 'AKIRA', 'YASU', 'KATSU', 'NORI', 'MAMORU',
  'EMI', 'MIKI', 'KEIKO', 'YOKO',
];

export interface DxEntity {
  /** 'K#' のように、# がコールエリアの数字になるプレフィックスの型 */
  prefixes: readonly string[];
  /** 数字の候補 (省略時 0〜9) */
  digits?: string;
  /** サフィックスの文字数の候補 */
  suffixLens: readonly number[];
  qths: readonly string[];
  names: readonly string[];
}

const EN_NAMES = ['BOB', 'JOHN', 'MIKE', 'DAVE', 'TOM', 'JIM', 'BILL', 'STEVE', 'PAUL', 'RICK', 'JOE', 'DAN', 'MARK', 'PETE', 'ED', 'AL'];

export const DX_ENTITIES: readonly DxEntity[] = [
  { prefixes: ['K#', 'W#', 'N#', 'AA#', 'AB#', 'KB#', 'KC#', 'KD#', 'WA#', 'WB#'], suffixLens: [2, 3, 3], qths: ['CA', 'TX', 'NY', 'FL', 'OHIO', 'WA', 'OREGON', 'ARIZONA', 'COLORADO', 'TEXAS', 'MAINE'], names: EN_NAMES },
  { prefixes: ['VE#', 'VA#'], digits: '1234567', suffixLens: [2, 3], qths: ['TORONTO', 'OTTAWA', 'VANCOUVER', 'MONTREAL'], names: EN_NAMES },
  { prefixes: ['DL#', 'DK#', 'DJ#'], suffixLens: [2, 3], qths: ['BERLIN', 'MUNICH', 'HAMBURG', 'BONN', 'COLOGNE'], names: ['HANS', 'KLAUS', 'PETER', 'UWE', 'JENS', 'FRANK'] },
  { prefixes: ['G#', 'M#'], suffixLens: [3], qths: ['LONDON', 'LEEDS', 'BRISTOL', 'YORK'], names: ['JOHN', 'DAVID', 'IAN', 'NIGEL', 'CHRIS', 'ANDY'] },
  { prefixes: ['F#'], digits: '12345689', suffixLens: [3], qths: ['PARIS', 'LYON', 'NICE', 'LILLE'], names: ['JEAN', 'PIERRE', 'MICHEL', 'ALAIN'] },
  { prefixes: ['I#', 'IK#', 'IZ#'], suffixLens: [3], qths: ['ROME', 'MILAN', 'TURIN', 'NAPLES'], names: ['MARCO', 'LUCA', 'GIANNI', 'PAOLO'] },
  { prefixes: ['EA#'], suffixLens: [2, 3], qths: ['MADRID', 'SEVILLA', 'VALENCIA'], names: ['JUAN', 'CARLOS', 'JOSE', 'PACO'] },
  { prefixes: ['UA#', 'RA#', 'RV#'], digits: '0134669', suffixLens: [2, 3], qths: ['MOSCOW', 'OMSK', 'TOMSK', 'KAZAN'], names: ['IVAN', 'OLEG', 'ALEX', 'SERGEY', 'IGOR'] },
  { prefixes: ['VK#'], digits: '1234567', suffixLens: [2, 3], qths: ['SYDNEY', 'MELBOURNE', 'BRISBANE', 'PERTH'], names: ['BRUCE', 'PETER', 'GREG', 'COLIN'] },
  { prefixes: ['ZL#'], digits: '1234', suffixLens: [2, 3], qths: ['AUCKLAND', 'WELLINGTON'], names: ['IAN', 'GRAHAM', 'ROSS'] },
  { prefixes: ['HL#', 'DS#'], digits: '12345', suffixLens: [2, 3], qths: ['SEOUL', 'BUSAN', 'INCHEON'], names: ['KIM', 'LEE', 'PARK', 'CHOI'] },
  { prefixes: ['BV#', 'BX#'], digits: '1235', suffixLens: [2, 3], qths: ['TAIPEI', 'TAICHUNG'], names: ['CHEN', 'LIN', 'WANG'] },
  { prefixes: ['BY#', 'BG#', 'BD#'], digits: '1234', suffixLens: [2, 3], qths: ['BEIJING', 'SHANGHAI', 'XIAN'], names: ['WANG', 'LI', 'ZHANG', 'LIU'] },
  { prefixes: ['DU#'], digits: '1379', suffixLens: [3], qths: ['MANILA', 'CEBU'], names: ['JOSE', 'BEN', 'RAMON'] },
  { prefixes: ['HS#'], digits: '01', suffixLens: [2, 3], qths: ['BANGKOK'], names: ['SOMCHAI', 'PRASIT'] },
  { prefixes: ['9V1'], digits: '', suffixLens: [2], qths: ['SINGAPORE'], names: ['TAN', 'LIM'] },
  { prefixes: ['PY#'], suffixLens: [2, 3], qths: ['SAO PAULO', 'RIO'], names: ['JOAO', 'PAULO', 'MARCOS'] },
  { prefixes: ['KH6'], digits: '', suffixLens: [2, 3], qths: ['HONOLULU', 'HILO'], names: EN_NAMES },
];

export const RIGS: readonly string[] = [
  'IC7300', 'IC7610', 'IC705', 'IC7100', 'FT991A', 'FT710', 'FTDX10', 'FTDX101D', 'FT891', 'TS590SG', 'TS890S', 'K3', 'K4', 'KX3',
];

export const POWERS: readonly string[] = ['5W', '10W', '20W', '50W', '50W', '100W', '100W', '200W'];

export const ANTENNAS: readonly string[] = [
  'DIPOLE', 'DIPOLE', 'INV V', 'GP', 'VERTICAL', '2EL YAGI', '3EL YAGI', 'LOOP', 'LONG WIRE', 'DELTA LOOP', 'MAG LOOP', 'HEX BEAM',
];

export interface Weather {
  en: string;
  ja: string;
  tempMin: number;
  tempMax: number;
}

export const WEATHERS: readonly Weather[] = [
  { en: 'FINE', ja: '晴れ', tempMin: 5, tempMax: 30 },
  { en: 'SUNNY', ja: '晴れ', tempMin: 5, tempMax: 32 },
  { en: 'CLOUDY', ja: '曇り', tempMin: 3, tempMax: 28 },
  { en: 'RAIN', ja: '雨', tempMin: 5, tempMax: 25 },
  { en: 'SNOW', ja: '雪', tempMin: -8, tempMax: 2 },
  { en: 'WINDY', ja: '風が強い', tempMin: 3, tempMax: 25 },
  { en: 'HOT', ja: '暑い', tempMin: 30, tempMax: 36 },
  { en: 'COLD', ja: '寒い', tempMin: -5, tempMax: 6 },
];
