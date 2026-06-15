import Foundation
import UIKit

enum APIError: LocalizedError {
    case badURL
    case encodingFailed
    case server(String)

    var errorDescription: String? {
        switch self {
        case .badURL: return "Invalid server URL."
        case .encodingFailed: return "Could not encode the image."
        case .server(let m): return m
        }
    }
}

struct APIClient {
    /// POST the image as multipart/form-data to {baseURL}/analyze and decode the result.
    static func analyze(image: UIImage, baseURL: String) async throws -> AnalysisResult {
        let trimmed = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: trimmed + "/analyze") else { throw APIError.badURL }
        guard let jpeg = image.jpegData(compressionQuality: 0.9) else { throw APIError.encodingFailed }

        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 180
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"photo.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(jpeg)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.server("No response from server.")
        }
        guard http.statusCode == 200 else {
            let text = String(data: data, encoding: .utf8) ?? "Server error \(http.statusCode)"
            throw APIError.server(text)
        }
        return try JSONDecoder().decode(AnalysisResult.self, from: data)
    }
}
