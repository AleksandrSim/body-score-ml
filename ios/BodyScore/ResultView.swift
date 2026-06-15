import SwiftUI

struct ResultView: View {
    let result: AnalysisResult

    var body: some View {
        VStack(spacing: 18) {
            scoreHeader

            if let summary = result.summary, !summary.isEmpty {
                Text(summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            regionsCard

            if let priorities = result.priorities, !priorities.isEmpty {
                listCard(title: "Priorities", symbol: "target", items: priorities)
            }
            if let strongest = result.strongestAreas, !strongest.isEmpty {
                listCard(title: "Strongest Areas", symbol: "star.fill",
                         items: strongest.map { prettyRegion($0) })
            }
        }
    }

    private var scoreHeader: some View {
        HStack(spacing: 20) {
            ZStack {
                Circle().stroke(Color.gray.opacity(0.2), lineWidth: 10)
                Circle()
                    .trim(from: 0, to: CGFloat(result.overallScore ?? 0) / 100.0)
                    .stroke(scoreColor(result.overallScore), style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 0) {
                    Text("\(result.overallScore ?? 0)").font(.system(size: 34, weight: .bold))
                    Text("/ 100").font(.caption2).foregroundStyle(.secondary)
                }
            }
            .frame(width: 110, height: 110)

            VStack(alignment: .leading, spacing: 6) {
                if let bf = result.estimatedBodyFatPercent {
                    Label("\(bf)% body fat", systemImage: "drop.fill")
                        .font(.headline)
                }
                Text(headline(result.overallScore))
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(scoreColor(result.overallScore))
            }
            Spacer()
        }
    }

    private var regionsCard: some View {
        VStack(spacing: 10) {
            ForEach(regionOrder, id: \.self) { key in
                if let r = result.regions?[key] {
                    VStack(spacing: 4) {
                        HStack {
                            Text(prettyRegion(key)).font(.subheadline)
                            Spacer()
                            Text(r.score.map(String.init) ?? "–")
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(scoreColor10(r.score))
                        }
                        ProgressView(value: Double(r.score ?? 0), total: 10)
                            .tint(scoreColor10(r.score))
                        if let notes = r.notes, !notes.isEmpty {
                            Text(notes)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color.gray.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
    }

    private func listCard(title: String, symbol: String, items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: symbol).font(.headline)
            ForEach(items, id: \.self) { item in
                HStack(alignment: .top, spacing: 8) {
                    Text("•")
                    Text(item)
                }
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.gray.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
    }

    private func scoreColor(_ s: Int?) -> Color {
        guard let s else { return .gray }
        switch s {
        case 80...: return .green
        case 60..<80: return .blue
        case 40..<60: return .orange
        default: return .red
        }
    }

    private func scoreColor10(_ s: Int?) -> Color {
        guard let s else { return .gray }
        switch s {
        case 8...: return .green
        case 6..<8: return .blue
        case 4..<6: return .orange
        default: return .red
        }
    }

    private func headline(_ s: Int?) -> String {
        guard let s else { return "—" }
        switch s {
        case 88...: return "Elite physique"
        case 78..<88: return "Strong physique"
        case 68..<78: return "Solid physique"
        case 58..<68: return "Developing"
        default: return "Foundation phase"
        }
    }
}
