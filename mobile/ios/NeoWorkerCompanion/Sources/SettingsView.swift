import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var connection: NeoWorkerConnection
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section("Server") {
                HStack {
                    Text("Host")
                    Spacer()
                    TextField("192.168.1.100", text: $connection.serverHost)
                        .multilineTextAlignment(.trailing)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                }

                HStack {
                    Text("Port")
                    Spacer()
                    TextField("18789", value: $connection.serverPort, format: .number)
                        .multilineTextAlignment(.trailing)
                        .keyboardType(.numberPad)
                }
            }

            Section("Authentication") {
                HStack {
                    Text("Token")
                    Spacer()
                    SecureField("Paste token here", text: $connection.token)
                        .multilineTextAlignment(.trailing)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }

            Section("Connection") {
                Toggle("Auto-reconnect", isOn: $connection.autoReconnect)
            }

            Section("Capabilities") {
                capabilityRow(name: "Camera", icon: "camera", available: true)
                capabilityRow(name: "Location", icon: "location", available: true)
                capabilityRow(name: "Notifications", icon: "bell", available: true)
            }

            Section("About") {
                HStack {
                    Text("App Version")
                    Spacer()
                    Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0")
                        .foregroundStyle(.secondary)
                }
                HStack {
                    Text("Protocol")
                    Spacer()
                    Text("Control Plane v1")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func capabilityRow(name: String, icon: String, available: Bool) -> some View {
        HStack {
            Image(systemName: icon)
                .foregroundStyle(.secondary)
            Text(name)
            Spacer()
            Image(systemName: available ? "checkmark.circle.fill" : "xmark.circle")
                .foregroundStyle(available ? .green : .red)
        }
    }
}
