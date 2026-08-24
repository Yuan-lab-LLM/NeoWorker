import SwiftUI

struct ContentView: View {
    @EnvironmentObject var connection: NeoWorkerConnection

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    statusCard
                    connectionButton
                    if connection.state == .connected {
                        statsCard
                    }
                    if connection.state == .disconnected {
                        setupInstructions
                    }
                }
                .padding()
            }
            .navigationTitle("NeoWorker Companion")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    NavigationLink(destination: SettingsView()) {
                        Image(systemName: "gear")
                    }
                }
            }
        }
    }

    // MARK: - Status Card

    private var statusCard: some View {
        VStack(spacing: 12) {
            HStack {
                Circle()
                    .fill(statusColor)
                    .frame(width: 14, height: 14)
                Text(statusText)
                    .font(.headline)
                Spacer()
            }

            if let error = connection.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private var statusColor: Color {
        switch connection.state {
        case .connected: return .green
        case .connecting, .authenticating, .reconnecting: return .orange
        case .disconnected: return .red
        }
    }

    private var statusText: String {
        switch connection.state {
        case .disconnected: return "Disconnected"
        case .connecting: return "Connecting..."
        case .authenticating: return "Authenticating..."
        case .connected: return "Connected to NeoWorker"
        case .reconnecting: return "Reconnecting..."
        }
    }

    // MARK: - Connection Button

    private var connectionButton: some View {
        Button(action: {
            if connection.state == .connected || connection.state == .reconnecting {
                connection.disconnect()
            } else {
                connection.connect()
            }
        }) {
            Label(
                connection.state == .connected || connection.state == .reconnecting
                    ? "Disconnect"
                    : "Connect",
                systemImage: connection.state == .connected
                    ? "wifi.slash"
                    : "wifi"
            )
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding()
            .background(
                connection.state == .connected || connection.state == .reconnecting
                    ? Color.red
                    : Color.accentColor
            )
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .disabled(connection.serverHost.isEmpty || connection.token.isEmpty)
    }

    // MARK: - Stats Card

    private var statsCard: some View {
        VStack(spacing: 16) {
            HStack {
                Text("Activity")
                    .font(.headline)
                Spacer()
            }

            HStack(spacing: 20) {
                statItem(value: "\(connection.commandCount)", label: "Commands", icon: "terminal")
                statItem(value: connection.lastCommand.isEmpty ? "-" : connection.lastCommand, label: "Last Command", icon: "arrow.right.circle")
            }
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private func statItem(value: String, label: String, icon: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(.body, design: .monospaced))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Setup Instructions

    private var setupInstructions: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Getting Started")
                .font(.headline)
            instructionRow(number: 1, text: "Open NeoWorker on your Mac")
            instructionRow(number: 2, text: "Go to Settings > Control Plane")
            instructionRow(number: 3, text: "Enable the Control Plane and copy the token")
            instructionRow(number: 4, text: "Tap the gear icon above to enter settings")
            instructionRow(number: 5, text: "Ensure both devices are on the same network")
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private func instructionRow(number: Int, text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(number)")
                .font(.caption)
                .fontWeight(.bold)
                .frame(width: 20, height: 20)
                .background(Color.accentColor.opacity(0.15))
                .clipShape(Circle())
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}
