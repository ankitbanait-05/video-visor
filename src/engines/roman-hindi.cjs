// Deterministic offline transliteration for Hinglish captions (Hindi written in English letters).
// Common words use the spellings people type in chat; other Devanagari words go through a phonetic
// fallback with Hindi schwa deletion (करना → karna, समझना → samajhna, मेरा → mera). Captions stay editable.
const common = {
  'आप': 'aap', 'कैसे': 'kaise', 'हैं': 'hain', 'है': 'hai', 'मैं': 'main', 'में': 'mein', 'हम': 'hum', 'हमें': 'humein', 'यह': 'yeh', 'ये': 'ye', 'वह': 'woh', 'वो': 'wo',
  'क्या': 'kya', 'क्यों': 'kyon', 'नहीं': 'nahi', 'और': 'aur', 'एक': 'ek', 'को': 'ko', 'का': 'ka', 'की': 'ki', 'के': 'ke', 'से': 'se', 'पर': 'par', 'लिए': 'liye',
  'कर': 'kar', 'करना': 'karna', 'करें': 'karein', 'हो': 'ho', 'होता': 'hota', 'होती': 'hoti', 'होते': 'hote', 'रहा': 'raha', 'रही': 'rahi', 'रहे': 'rahe', 'भी': 'bhi',
  'तो': 'to', 'इस': 'is', 'उस': 'us', 'अपने': 'apne', 'अपनी': 'apni', 'अपना': 'apna', 'आपका': 'aapka', 'आपकी': 'aapki', 'आपके': 'aapke', 'आपको': 'aapko', 'हमारा': 'hamara',
  'हमारी': 'hamari', 'हमारे': 'hamare', 'अच्छा': 'achha', 'अच्छी': 'achhi', 'अच्छे': 'achhe', 'आज': 'aaj', 'कल': 'kal', 'अब': 'ab', 'जब': 'jab', 'तब': 'tab', 'सभी': 'sabhi',
  'सब': 'sab', 'बहुत': 'bahut', 'कुछ': 'kuch', 'नमस्ते': 'namaste', 'नमस्कार': 'namaskar', 'धन्यवाद': 'dhanyavaad', 'शुक्रिया': 'shukriya',
  'था': 'tha', 'थी': 'thi', 'थे': 'the', 'गया': 'gaya', 'गई': 'gayi', 'गयी': 'gayi', 'गए': 'gaye', 'जाना': 'jaana', 'जाता': 'jaata', 'जाती': 'jaati', 'जाते': 'jaate', 'जाएगा': 'jaayega',
  'चाहिए': 'chahiye', 'सकते': 'sakte', 'सकता': 'sakta', 'सकती': 'sakti', 'लेकिन': 'lekin', 'अगर': 'agar', 'क्योंकि': 'kyunki', 'फिर': 'phir', 'यहाँ': 'yahan', 'यहां': 'yahan',
  'वहाँ': 'wahan', 'वहां': 'wahan', 'कहाँ': 'kahan', 'कहां': 'kahan', 'कब': 'kab', 'कौन': 'kaun', 'कैसा': 'kaisa', 'कैसी': 'kaisi', 'कितना': 'kitna', 'कितने': 'kitne', 'कितनी': 'kitni',
  'साथ': 'saath', 'बात': 'baat', 'बाद': 'baad', 'पहले': 'pehle', 'अभी': 'abhi', 'सिर्फ': 'sirf', 'सिर्फ़': 'sirf', 'ज्यादा': 'zyada', 'ज़्यादा': 'zyada', 'कम': 'kam',
  'बड़ा': 'bada', 'बड़ी': 'badi', 'बड़े': 'bade', 'छोटा': 'chhota', 'छोटी': 'chhoti', 'नया': 'naya', 'नई': 'nayi', 'नए': 'naye', 'पुराना': 'purana', 'दिन': 'din', 'साल': 'saal',
  'समय': 'samay', 'काम': 'kaam', 'लोग': 'log', 'लोगों': 'logon', 'देखो': 'dekho', 'देखिए': 'dekhiye', 'देखें': 'dekhein', 'देखते': 'dekhte', 'बताओ': 'batao', 'बताइए': 'bataiye',
  'चलिए': 'chaliye', 'चलो': 'chalo', 'ठीक': 'theek', 'हाँ': 'haan', 'हां': 'haan', 'जी': 'ji', 'मतलब': 'matlab', 'यानी': 'yaani', 'तरह': 'tarah', 'ऐसे': 'aise', 'वैसे': 'waise',
  'जैसे': 'jaise', 'इसलिए': 'isliye', 'ताकि': 'taaki', 'उनका': 'unka', 'उनकी': 'unki', 'उनके': 'unke', 'मेरा': 'mera', 'मेरी': 'meri', 'मेरे': 'mere', 'तुम': 'tum',
  'तुम्हारा': 'tumhara', 'हमको': 'humko', 'मुझे': 'mujhe', 'उसे': 'use', 'इसे': 'ise', 'इसको': 'isko', 'उसको': 'usko', 'किया': 'kiya', 'करते': 'karte', 'करती': 'karti',
  'करता': 'karta', 'करो': 'karo', 'कीजिए': 'kijiye', 'दिया': 'diya', 'देना': 'dena', 'देते': 'dete', 'लेना': 'lena', 'लेते': 'lete', 'मिल': 'mil', 'मिलेगा': 'milega',
  'मिलेगी': 'milegi', 'पता': 'pata', 'शुरू': 'shuru', 'आसान': 'aasaan', 'जरूरी': 'zaroori', 'ज़रूरी': 'zaroori', 'होगा': 'hoga', 'होगी': 'hogi', 'होंगे': 'honge',
  'थोड़ा': 'thoda', 'थोड़ी': 'thodi', 'रहेंगे': 'rahenge', 'सीखेंगे': 'seekhenge', 'समझ': 'samajh', 'पैसा': 'paisa', 'पैसे': 'paise', 'रुपये': 'rupaye', 'रुपए': 'rupaye',
  'निवेश': 'nivesh', 'बाजार': 'bazaar', 'बाज़ार': 'bazaar', 'विदियो': 'video', 'वीडियो': 'video', 'तीम': 'team', 'टीम': 'team', 'कैप्शन': 'caption', 'क्लिप': 'clip',
  'स्क्रिप्ट': 'script', 'ऑडियो': 'audio', 'स्क्रीन': 'screen', 'एडिट': 'edit', 'फाइल': 'file', 'फ़ाइल': 'file', 'प्लान': 'plan', 'पोर्टफोलियो': 'portfolio', 'स्टॉक': 'stock',
  'स्टॉक्स': 'stocks', 'शेयर': 'share', 'फंड': 'fund', 'म्यूचुअल': 'mutual', 'रिटर्न': 'return', 'रिटर्न्स': 'returns', 'ऐप': 'app', 'लिंक': 'link', 'क्लिक': 'click',
  'बटन': 'button', 'डाउनलोड': 'download', 'ऑप्शन': 'option', 'ऑप्शंस': 'options', 'इन्वेस्ट': 'invest', 'इन्वेस्टमेंट': 'investment', 'मार्केट': 'market',
};
const consonants = { 'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh',
  'स': 's', 'ह': 'h', 'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'ड़': 'd', 'ढ़': 'dh', 'फ़': 'f' };
const nukta = { 'क': 'q', 'ख': 'kh', 'ग': 'gh', 'ज': 'z', 'ड': 'd', 'ढ': 'dh', 'फ': 'f' };
const matras = { 'ा': 'aa', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e' };
const independent = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o' };
const other = { 'ः': 'h', '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9', '।': '.', '॥': '.' };

// Splits a word into units: consonants (with their vowel; '' after a virama, 'a' when inherent),
// independent vowels, nasal marks and other characters.
function units(s) {
  const chars = [...s.normalize('NFC')], out = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (consonants[c]) {
      let base = consonants[c];
      if (chars[i + 1] === '़') { base = nukta[c] || base; i++; }
      const n = chars[i + 1];
      if (n === '्') { out.push({ kind: 'C', base, vowel: '' }); i++; }
      else if (matras[n]) { out.push({ kind: 'C', base, vowel: matras[n] }); i++; }
      else out.push({ kind: 'C', base, vowel: 'a', inherent: true });
    } else if (independent[c]) out.push({ kind: 'V', vowel: independent[c] });
    else if (c === 'ं' || c === 'ँ') out.push({ kind: 'N' });
    else if (matras[c]) out.push({ kind: 'V', vowel: matras[c] });
    else if (c === '्' || c === '़') continue;
    else out.push({ kind: 'X', text: other[c] ?? c });
  }
  return out;
}
const voiced = u => u && (u.kind === 'V' || (u.kind === 'C' && u.vowel !== ''));
function word(s) {
  if (common[s]) return common[s];
  const u = units(s), C = u.map((x, i) => x.kind === 'C' ? i : -1).filter(i => i >= 0);
  if (!C.length) return u.map(x => x.vowel ?? x.text ?? 'n').join('');
  // A word-final inherent vowel is silent, unless it ends a consonant cluster (मित्र → mitra) or the word is one letter.
  const last = C.at(-1), afterLast = u.slice(last + 1).every(x => x.kind === 'N');
  if (afterLast && u[last].inherent && u.length > 1 && !(u[last - 1]?.kind === 'C' && u[last - 1].vowel === '' && /^[ryv]$/.test(u[last].base))) u[last].vowel = '';
  // Medial schwa deletion, right to left: V C(a) C V → V C C V (कमरा → kamra, समझना → samajhna).
  for (let k = C.length - 2; k >= 1; k--) {
    const i = C[k], x = u[i];
    if (!x.inherent || x.vowel !== 'a') continue;
    if (voiced(u[i - 1]) && u[i + 1]?.kind === 'C' && u[i + 1].vowel !== '' && u[i - 1]?.kind !== 'N') x.vowel = '';
  }
  // Long ā and ū are doubled only in one-vowel words (baat, kaam, doodh); elsewhere chat spelling uses a and u (bharat, kitab).
  const full = u.filter(x => (x.kind === 'C' || x.kind === 'V') && x.vowel).length;
  let out = '';
  u.forEach((x, i) => {
    const end = u.slice(i + 1).every(y => y.kind === 'N');
    const finalVowel = v => (end || full > 1) ? ({ aa: 'a', oo: 'u' }[v] || v) : v;
    if (x.kind === 'C') out += x.base + finalVowel(x.vowel);
    else if (x.kind === 'V') out += finalVowel(x.vowel);
    else if (x.kind === 'N') { const n = u[i + 1]; out += n?.kind === 'C' && /^(p|b|m)/.test(n.base) ? 'm' : 'n'; }
    else out += x.text;
  });
  return out;
}
const romanize = text => text.replace(/[ऀ-ॿ]+/g, word);
function linesToRoman(lines) { return lines.map(l => ({ ...l, text: romanize(l.text), words: l.words?.map(w => ({ ...w, text: romanize(w.text) })) })); }
module.exports = { romanize, linesToRoman, word };
