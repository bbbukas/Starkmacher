// Das Hilfsprogramm für Fotos, komplett auf dem Mac und ohne Internet (Apple Vision und ImageIO).
//
//   starkmacher-sehen lesen <bild>                liest Text und Barcodes, gibt JSON aus
//   starkmacher-sehen jpeg <bild> <ziel> <pixel>  schreibt das Bild richtig gedreht, verkleinert und ohne Metadaten (auch ohne Standort)
//
// Koordinaten sind Anteile von 0 bis 1, gemessen von oben links, im richtig gedrehten Bild.
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

struct Zeile: Encodable {
  let text: String
  let x: Double
  let y: Double
  let b: Double
  let h: Double
  /** Wie schief die Zeile liegt: Änderung von y je Änderung von x. */
  let steigung: Double
  let sicher: Double
}

struct Barcode: Encodable {
  let wert: String
  let art: String
}

struct Ergebnis: Encodable {
  let zeilen: [Zeile]
  let barcodes: [Barcode]
}

func fehler(_ text: String) -> Never {
  FileHandle.standardError.write(Data((text + "\n").utf8))
  exit(1)
}

func quelle(_ pfad: String) -> CGImageSource {
  guard let q = CGImageSourceCreateWithURL(URL(fileURLWithPath: pfad) as CFURL, nil), CGImageSourceGetCount(q) > 0 else {
    fehler("Das Bild lässt sich nicht lesen.")
  }
  return q
}

func lesen(_ pfad: String) {
  // Handyfotos liegen oft gedreht in der Datei und tragen die Drehung nur als Angabe.
  let eigenschaften = CGImageSourceCopyPropertiesAtIndex(quelle(pfad), 0, nil) as? [CFString: Any]
  let wert = (eigenschaften?[kCGImagePropertyOrientation] as? UInt32) ?? 1
  let drehung = CGImagePropertyOrientation(rawValue: wert) ?? .up

  let texte = VNRecognizeTextRequest()
  texte.recognitionLevel = .accurate
  texte.recognitionLanguages = ["de-DE", "en-US"]
  // Ohne Korrektur: Sie „verbessert“ sonst Zahlen und Einheiten zu Wörtern.
  texte.usesLanguageCorrection = false
  let codes = VNDetectBarcodesRequest()

  do {
    try VNImageRequestHandler(url: URL(fileURLWithPath: pfad), orientation: drehung, options: [:]).perform([texte, codes])
  } catch {
    fehler("Das Bild lässt sich nicht lesen: \(error.localizedDescription)")
  }

  let zeilen: [Zeile] = (texte.results ?? []).compactMap { z in
    guard let kandidat = z.topCandidates(1).first else { return nil }
    let r = z.boundingBox
    let breite = z.topRight.x - z.topLeft.x
    // Vision misst von unten links, das Programm von oben links.
    let steigung = breite > 0.001 ? -(z.topRight.y - z.topLeft.y) / breite : 0
    return Zeile(text: kandidat.string, x: r.minX, y: 1 - r.maxY, b: r.width, h: r.height, steigung: steigung, sicher: Double(kandidat.confidence))
  }

  var gesehen = Set<String>()
  let barcodes: [Barcode] = (codes.results ?? []).compactMap { b in
    guard let wert = b.payloadStringValue, gesehen.insert(wert).inserted else { return nil }
    return Barcode(wert: wert, art: b.symbology.rawValue.replacingOccurrences(of: "VNBarcodeSymbology", with: ""))
  }

  guard let daten = try? JSONEncoder().encode(Ergebnis(zeilen: zeilen, barcodes: barcodes)) else { fehler("Das Ergebnis lässt sich nicht schreiben.") }
  FileHandle.standardOutput.write(daten)
}

func jpeg(_ pfad: String, _ ziel: String, _ pixel: Int) {
  let optionen: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceCreateThumbnailWithTransform: true,
    kCGImageSourceThumbnailMaxPixelSize: pixel,
  ]
  guard let bild = CGImageSourceCreateThumbnailAtIndex(quelle(pfad), 0, optionen as CFDictionary) else { fehler("Das Bild lässt sich nicht lesen.") }
  guard let aus = CGImageDestinationCreateWithURL(URL(fileURLWithPath: ziel) as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { fehler("Das Bild lässt sich nicht schreiben.") }
  // Ohne Angaben aus der Quelle: Die Standortdaten eines Handyfotos bleiben so draußen.
  CGImageDestinationAddImage(aus, bild, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
  guard CGImageDestinationFinalize(aus) else { fehler("Das Bild lässt sich nicht schreiben.") }
}

let a = CommandLine.arguments
if a.count == 3, a[1] == "lesen" {
  lesen(a[2])
} else if a.count == 5, a[1] == "jpeg", let pixel = Int(a[4]), pixel > 0 {
  jpeg(a[2], a[3], pixel)
} else {
  fehler("Aufruf: starkmacher-sehen lesen <bild> | jpeg <bild> <ziel> <pixel>")
}
