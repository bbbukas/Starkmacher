// Erzeugt die erfundenen Testbilder in tests/bilder (Bauauftrag Abschnitt 12). Alle Werte, Namen und Codes sind ausgedacht.
// Aufruf aus dem Projektordner: swift native/testbilder.swift
import AppKit
import CoreImage
import ImageIO
import UniformTypeIdentifiers

let ordner = "tests/bilder/"
try! FileManager.default.createDirectory(atPath: ordner, withIntermediateDirectories: true)

struct Text {
  let text: String
  let x: CGFloat
  let y: CGFloat
  var groesse: CGFloat = 34
  var fett = false
}

/** Zeichnet Text auf weißen Grund. y zählt von oben. */
func seite(_ breite: Int, _ hoehe: Int, _ texte: [Text], linien: [CGFloat] = []) -> NSBitmapImageRep {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: breite, pixelsHigh: hoehe, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSColor(calibratedRed: 0.98, green: 0.97, blue: 0.94, alpha: 1).setFill()
  NSRect(x: 0, y: 0, width: breite, height: hoehe).fill()
  NSColor.darkGray.setFill()
  for l in linien { NSRect(x: 50, y: CGFloat(hoehe) - l, width: CGFloat(breite) - 100, height: 2).fill() }
  for t in texte {
    let schrift = t.fett ? NSFont.boldSystemFont(ofSize: t.groesse) : NSFont.systemFont(ofSize: t.groesse)
    (t.text as NSString).draw(at: NSPoint(x: t.x, y: CGFloat(hoehe) - t.y - t.groesse), withAttributes: [.font: schrift, .foregroundColor: NSColor.black])
  }
  NSGraphicsContext.restoreGraphicsState()
  return rep
}

func png(_ rep: NSBitmapImageRep, _ name: String) {
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: ordner + name))
}

let ci = CIContext()

/** Sieht aus wie ein Handyfoto: leicht schief, etwas unscharf, flau und verrauscht. */
func wieHandy(_ rep: NSBitmapImageRep, winkel: Double, unschaerfe: Double, kontrast: Double) -> CGImage {
  var b = CIImage(cgImage: rep.cgImage!)
  b = b.transformed(by: CGAffineTransform(rotationAngle: winkel * .pi / 180))
  b = b.applyingGaussianBlur(sigma: unschaerfe).cropped(to: b.extent)
  b = b.applyingFilter("CIColorControls", parameters: ["inputContrast": kontrast, "inputBrightness": -0.05])
  let rauschen = CIFilter(name: "CIRandomGenerator")!.outputImage!.applyingFilter("CIColorMatrix", parameters: [
    "inputRVector": CIVector(x: 0.05, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0, y: 0.05, z: 0, w: 0), "inputBVector": CIVector(x: 0, y: 0, z: 0.05, w: 0), "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0),
  ])
  b = rauschen.applyingFilter("CIAdditionCompositing", parameters: [kCIInputBackgroundImageKey: b]).cropped(to: b.extent)
  return ci.createCGImage(b, from: b.extent)!
}

func jpg(_ bild: CGImage, _ name: String, drehung: UInt32 = 1) {
  let ziel = CGImageDestinationCreateWithURL(URL(fileURLWithPath: ordner + name) as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(ziel, bild, [kCGImageDestinationLossyCompressionQuality: 0.7, kCGImagePropertyOrientation: drehung] as CFDictionary)
  CGImageDestinationFinalize(ziel)
}

// Nährwerttabelle mit den Spalten „pro 100 g“, „pro Portion“ und „% RM“
let zeilenTabelle: [(String, String, String, String)] = [
  ("Brennwert", "1523 kJ / 364 kcal", "609 kJ / 146 kcal", "7 %"),
  ("Fett", "11,6 g", "4,6 g", "7 %"),
  ("davon gesättigte Fettsäuren", "3,5 g", "1,4 g", "7 %"),
  ("Kohlenhydrate", "55 g", "22 g", "8 %"),
  ("davon Zucker", "12 g", "4,8 g", "5 %"),
  ("Ballaststoffe", "6,2 g", "2,5 g", ""),
  ("Eiweiß", "8,4 g", "3,4 g", "7 %"),
  ("Salz", "0,95 g", "0,38 g", "6 %"),
]
func tabelleDreiSpalten() -> NSBitmapImageRep {
  var t = [Text(text: "Durchschnittliche Nährwerte", x: 60, y: 40, groesse: 34, fett: true), Text(text: "pro 100 g", x: 640, y: 40, fett: true), Text(text: "pro Portion (40 g)", x: 960, y: 40, fett: true), Text(text: "% RM*", x: 1320, y: 40, fett: true)]
  for (i, z) in zeilenTabelle.enumerated() {
    let y = 110 + CGFloat(i) * 62
    t += [Text(text: z.0, x: z.0.hasPrefix("davon") ? 90 : 60, y: y), Text(text: z.1, x: 640, y: y), Text(text: z.2, x: 960, y: y), Text(text: z.3, x: 1320, y: y)]
  }
  t.append(Text(text: "*Referenzmenge für einen durchschnittlichen Erwachsenen", x: 60, y: 620, groesse: 24))
  return seite(1500, 680, t, linien: [95])
}
let dreiSpalten = tabelleDreiSpalten()
png(dreiSpalten, "naehrwerte-100g.png")
jpg(wieHandy(dreiSpalten, winkel: 4, unschaerfe: 1.2, kontrast: 0.8), "naehrwerte-handy.jpg")
jpg(wieHandy(dreiSpalten, winkel: -6, unschaerfe: 2.2, kontrast: 0.6), "naehrwerte-schlecht.jpg")

// Dasselbe Bild, aber gedreht gespeichert, wie es Handys tun: Die Drehung steht nur als Angabe in der Datei.
let gedreht = CIImage(cgImage: dreiSpalten.cgImage!).oriented(.left)
jpg(ci.createCGImage(gedreht, from: gedreht.extent)!, "naehrwerte-gedreht.jpg", drehung: 6)

// Nur pro Portion
var nurPortion = [Text(text: "Nährwerte", x: 60, y: 40, fett: true), Text(text: "pro Riegel (25 g)", x: 640, y: 40, fett: true)]
let portionsWerte: [(String, String)] = [("Energie", "420 kJ / 100 kcal"), ("Fett", "4,0 g"), ("davon gesättigte Fettsäuren", "1,5 g"), ("Kohlenhydrate", "12,5 g"), ("davon Zucker", "5,0 g"), ("Ballaststoffe", "1,0 g"), ("Eiweiß", "3,0 g"), ("Salz", "0,1 g")]
for (i, z) in portionsWerte.enumerated() {
  let y = 110 + CGFloat(i) * 62
  nurPortion += [Text(text: z.0, x: 60, y: y), Text(text: z.1, x: 640, y: y)]
}
png(seite(1100, 640, nurPortion, linien: [95]), "naehrwerte-portion.png")

// Getränk, je 100 ml
var getraenk = [Text(text: "Nährwertangaben je 100 ml", x: 60, y: 40, fett: true)]
let getraenkWerte: [(String, String)] = [("Brennwert", "188 kJ / 45 kcal"), ("Fett", "< 0,5 g"), ("davon gesättigte Fettsäuren", "< 0,1 g"), ("Kohlenhydrate", "10,6 g"), ("davon Zucker", "10,6 g"), ("Eiweiß", "< 0,5 g"), ("Salz", "0,01 g")]
for (i, z) in getraenkWerte.enumerated() {
  let y = 110 + CGFloat(i) * 62
  getraenk += [Text(text: z.0, x: 60, y: y), Text(text: z.1, x: 640, y: y)]
}
png(seite(1100, 600, getraenk, linien: [95]), "naehrwerte-getraenk.png")

// Rezept untereinander
let zutaten = ["200 g Mehl", "2 EL Olivenöl", "1 Dose Kichererbsen (240 g)", "3 Eier", "1/2 TL Salz", "1 Zwiebel", "2 Zehen Knoblauch", "150 ml Milch", "1 Prise Muskat", "Pfeffer"]
var rezept = [Text(text: "Goldene Testpfanne", x: 60, y: 40, groesse: 52, fett: true), Text(text: "Zutaten für 4 Portionen", x: 60, y: 130, groesse: 36, fett: true)]
for (i, z) in zutaten.enumerated() { rezept.append(Text(text: z, x: 60, y: 190 + CGFloat(i) * 52)) }
rezept.append(Text(text: "Zubereitung", x: 60, y: 730, groesse: 36, fett: true))
let schritte = ["1. Die Zwiebel fein würfeln und mit dem Knoblauch im Öl", "glasig anbraten.", "2. Kichererbsen dazugeben und fünf Minuten mitbraten.", "3. Mehl, Eier und Milch verrühren, mit Salz, Muskat und", "Pfeffer würzen und über das Gemüse gießen.", "4. Bei mittlerer Hitze stocken lassen und warm servieren."]
for (i, s) in schritte.enumerated() { rezept.append(Text(text: s, x: 60, y: 790 + CGFloat(i) * 50)) }
let rezeptBild = seite(1200, 1130, rezept)
png(rezeptBild, "rezept.png")
jpg(wieHandy(rezeptBild, winkel: 3, unschaerfe: 1.0, kontrast: 0.85), "rezept-handy.jpg")

// Rezept in zwei Spalten, die Mengen getrennt vom Namen, wie in Kochbüchern
var spalten = [Text(text: "Linsentopf vom Testtag", x: 60, y: 40, groesse: 52, fett: true), Text(text: "Für 2 Personen", x: 60, y: 115, groesse: 30), Text(text: "Zutaten", x: 60, y: 180, groesse: 36, fett: true), Text(text: "Zubereitung", x: 700, y: 180, groesse: 36, fett: true)]
let getrennt: [(String, String)] = [("150 g", "rote Linsen"), ("1", "Möhre"), ("1 EL", "Rapsöl"), ("400 ml", "Gemüsebrühe"), ("1 Becher", "Joghurt"), ("½ TL", "Kreuzkümmel")]
for (i, z) in getrennt.enumerated() {
  let y = 240 + CGFloat(i) * 52
  spalten += [Text(text: z.0, x: 60, y: y), Text(text: z.1, x: 240, y: y)]
}
let rechts = ["Die Möhre würfeln und im Öl anbraten.", "Linsen und Brühe dazugeben und", "zehn Minuten leise kochen lassen.", "Mit Kreuzkümmel würzen und mit", "Joghurt servieren."]
for (i, s) in rechts.enumerated() { spalten.append(Text(text: s, x: 700, y: 240 + CGFloat(i) * 52, groesse: 32)) }
png(seite(1400, 620, spalten), "rezept-spalten.png")

// Barcode: ein erfundener EAN-13-Code
let L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
let G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"]
let R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"]
let MUSTER = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]
func ean13(_ zwoelf: String) -> (String, String) {
  let z = zwoelf.map { Int(String($0))! }
  var s = 0
  for (i, d) in z.enumerated() { s += i % 2 == 0 ? d : 3 * d }
  let pruef = (10 - s % 10) % 10
  var bits = "101"
  let m = Array(MUSTER[z[0]])
  for i in 1...6 { bits += m[i - 1] == "L" ? L[z[i]] : G[z[i]] }
  bits += "01010"
  for i in 7...11 { bits += R[z[i]] }
  bits += R[pruef] + "101"
  return (zwoelf + String(pruef), bits)
}
let (nummer, bits) = ean13("400000012345")
let modul: CGFloat = 5
let rep = seite(Int(CGFloat(bits.count) * modul) + 200, 400, [Text(text: nummer, x: 130, y: 330, groesse: 36)])
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor.black.setFill()
for (i, b) in bits.enumerated() where b == "1" { NSRect(x: 100 + CGFloat(i) * modul, y: 80, width: modul, height: 280).fill() }
NSGraphicsContext.restoreGraphicsState()
png(rep, "barcode.png")
jpg(wieHandy(rep, winkel: 7, unschaerfe: 1.0, kontrast: 0.85), "barcode-handy.jpg")
// Ein Foto mit Standort in der Datei, wie vom Handy. Die Koordinaten sind ausgedacht (mitten im Meer).
let mitStandort = CGImageDestinationCreateWithURL(URL(fileURLWithPath: ordner + "foto-mit-standort.jpg") as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(mitStandort, rep.cgImage!, [
  kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 1.0, kCGImagePropertyGPSLatitudeRef: "N", kCGImagePropertyGPSLongitude: 1.0, kCGImagePropertyGPSLongitudeRef: "E"],
  kCGImagePropertyExifDictionary: [kCGImagePropertyExifUserComment: "erfunden"],
] as CFDictionary)
CGImageDestinationFinalize(mitStandort)
print("Fertig. Barcode:", nummer)
