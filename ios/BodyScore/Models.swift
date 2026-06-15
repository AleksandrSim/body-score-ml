import Foundation

/// Mirrors the JSON returned by the FastAPI /analyze endpoint.
struct AnalysisResult: Codable {
    let overallScore: Int?
    let estimatedBodyFatPercent: Int?
    let summary: String?
    let strongestAreas: [String]?
    let priorities: [String]?
    let regions: [String: Region]?

    enum CodingKeys: String, CodingKey {
        case overallScore = "overall_score"
        case estimatedBodyFatPercent = "estimated_body_fat_percent"
        case summary
        case strongestAreas = "strongest_areas"
        case priorities
        case regions
    }
}

struct Region: Codable {
    let score: Int?
    let grade: String?
    let notes: String?
}

/// Fixed display order so the regions list is stable.
let regionOrder = [
    "shoulders", "chest", "arms", "abs", "back", "legs",
    "posture", "symmetry", "body_fat", "conditioning",
]

func prettyRegion(_ key: String) -> String {
    key.replacingOccurrences(of: "_", with: " ").capitalized
}
