import Foundation
import PDFKit
import Vision
import AppKit
let input = CommandLine.arguments[1]
let output = CommandLine.arguments[2]
let doc = PDFDocument(url: URL(fileURLWithPath: input))!
var pages: [[String: Any]] = []
let selected = CommandLine.arguments.count > 3 ? Set(CommandLine.arguments[3].split(separator: ",").compactMap { Int($0) }.map { $0 - 1 }) : Set(0..<doc.pageCount)
for i in 0..<doc.pageCount where selected.contains(i) {
 autoreleasepool {
  let page = doc.page(at: i)!
  let image = page.thumbnail(of: NSSize(width: 2600, height: 3600), for: .mediaBox)
  var rect = NSRect(origin: .zero, size: image.size)
  let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["en-US"]
  request.usesLanguageCorrection = false
  try! VNImageRequestHandler(cgImage: cg).perform([request])
  let lines = (request.results ?? []).compactMap { o -> [String: Any]? in
   guard let c = o.topCandidates(1).first else { return nil }
   return ["text": c.string, "x": o.boundingBox.minX, "y": 1-o.boundingBox.maxY, "w": o.boundingBox.width, "h": o.boundingBox.height, "confidence": c.confidence]
  }.sorted { ($0["y"] as! CGFloat) < ($1["y"] as! CGFloat) }
  pages.append(["page":i+1,"text":lines.map{$0["text"] as! String}.joined(separator:"\n"),"lines":lines])
 }
 if i % 10 == 0 { print("OCR \(URL(fileURLWithPath: input).lastPathComponent.prefix(32)) \(i+1)/\(doc.pageCount)"); fflush(stdout) }
}
try! JSONSerialization.data(withJSONObject: pages).write(to: URL(fileURLWithPath: output))
