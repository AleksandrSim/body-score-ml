import SwiftUI
import UIKit

struct ContentView: View {
    // Editable in-app so you can paste a new tunnel URL without rebuilding.
    @AppStorage("serverURL") private var serverURL =
        "https://jersey-competitions-zinc-schedules.trycloudflare.com"

    @State private var image: UIImage?
    @State private var result: AnalysisResult?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var pickerSource: UIImagePickerController.SourceType?
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    if let image {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                            .frame(maxHeight: 320)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    }

                    if isLoading {
                        VStack(spacing: 10) {
                            ProgressView()
                            Text("Analyzing… this can take ~10–80s")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 24)
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }

                    if let result {
                        ResultView(result: result)
                    }

                    if !isLoading {
                        actionButtons
                    }
                }
                .padding()
            }
            .navigationTitle("Body Score")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: { Image(systemName: "gearshape") }
                }
            }
            .fullScreenCover(item: $pickerSource) { source in
                ImagePicker(sourceType: source) { picked in
                    image = picked
                    result = nil
                    errorMessage = nil
                    analyze(picked)
                }
                .ignoresSafeArea()
            }
            .sheet(isPresented: $showSettings) {
                SettingsView(serverURL: $serverURL)
            }
        }
    }

    private var actionButtons: some View {
        VStack(spacing: 12) {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button {
                    pickerSource = .camera
                } label: {
                    Label("Take Photo", systemImage: "camera.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            Button {
                pickerSource = .photoLibrary
            } label: {
                Label("Choose from Library", systemImage: "photo.on.rectangle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
        }
        .padding(.top, 4)
    }

    private func analyze(_ img: UIImage) {
        isLoading = true
        errorMessage = nil
        Task {
            do {
                let res = try await APIClient.analyze(image: img, baseURL: serverURL)
                result = res
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}

// Lets us drive .fullScreenCover(item:) with the source-type enum.
extension UIImagePickerController.SourceType: @retroactive Identifiable {
    public var id: Int { rawValue }
}

struct SettingsView: View {
    @Binding var serverURL: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Server URL") {
                    TextField("https://…", text: $serverURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                }
                Section {
                    Text("Paste the current demo URL here. It changes each time the tunnel restarts.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
