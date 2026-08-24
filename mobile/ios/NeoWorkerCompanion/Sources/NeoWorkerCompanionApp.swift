import SwiftUI

@main
struct NeoWorkerCompanionApp: App {
    @StateObject private var connection = NeoWorkerConnection()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(connection)
        }
    }
}
