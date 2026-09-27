/**
 * Public URL shorteners. Carriers filter links on shared shortener domains, because
 * anyone can hide any destination behind one. Matched exactly, and on subdomains.
 */
export const SHORTENER_DOMAINS = new Set([
  'bit.ly', 'bitly.com', 'buff.ly', 'cutt.ly', 'goo.gl', 'is.gd', 'lnkd.in', 'ow.ly',
  'rb.gy', 'rebrand.ly', 'shorturl.at', 't.co', 't.ly', 'tiny.cc', 'tinyurl.com',
  'v.gd', 'x.co', 'bl.ink', 'short.io', 'shorte.st', 'soo.gd', 'clck.ru', 'qrco.de',
  's.id', 'urlz.fr', 'tr.ee',
])
