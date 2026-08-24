import AppKit
import Foundation
import HealthKit

enum BridgeRuntimeError: Error {
    case invalidRequest(String)
    case unavailable(String)
    case authorizationDenied(String)
    case queryFailed(String)
    case writeFailed(String)
}

private let healthStore = HKHealthStore()
private let readableTypes: [String] = [
    "steps",
    "sleep",
    "heart_rate",
    "hrv",
    "weight",
    "glucose",
    "workout",
]

private let writableTypes: [String] = [
    "steps",
    "sleep",
    "heart_rate",
    "hrv",
    "weight",
    "glucose",
    "workout",
]

private func now() -> Double { Date().timeIntervalSince1970 * 1000 }

private func decodeRequest() throws -> BridgeRequest {
    let args = CommandLine.arguments
    if let requestIndex = args.firstIndex(of: "--request-file"), requestIndex + 1 < args.count {
        let requestPath = args[requestIndex + 1]
        let data = try Data(contentsOf: URL(fileURLWithPath: requestPath))
        guard !data.isEmpty else {
            throw BridgeRuntimeError.invalidRequest("Missing request payload.")
        }
        return try JSONDecoder().decode(BridgeRequest.self, from: data)
    }

    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard !data.isEmpty else {
        throw BridgeRuntimeError.invalidRequest("Missing request payload.")
    }
    return try JSONDecoder().decode(BridgeRequest.self, from: data)
}

private func responseOutputPath() -> String? {
    let args = CommandLine.arguments
    guard let responseIndex = args.firstIndex(of: "--response-file"), responseIndex + 1 < args.count else {
        return nil
    }
    return args[responseIndex + 1]
}

private func emit<T: Codable>(_ envelope: BridgeEnvelope<T>) -> Never {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    let data = (try? encoder.encode(envelope)) ?? Data(#"{"ok":false,"error":{"code":"ENCODE_FAILED","message":"Failed to encode bridge response."}}"#.utf8)
    if let outputPath = responseOutputPath() {
        try? data.write(to: URL(fileURLWithPath: outputPath))
    } else {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    }
    exit(envelope.ok ? 0 : 1)
}

private func healthDataAvailable() -> Bool {
    HKHealthStore.isHealthDataAvailable()
}

private func authorizationStatusString(for type: HKObjectType) -> String {
    let status = healthStore.authorizationStatus(for: type)
    switch status {
    case .sharingAuthorized:
        return "authorized"
    case .sharingDenied:
        return "denied"
    case .notDetermined:
        return "not-determined"
    @unknown default:
        return "restricted"
    }
}

private func makeMetricLabel(_ key: String) -> (String, String) {
    switch key {
    case "steps": return ("Steps", "steps")
    case "sleep": return ("Sleep", "min")
    case "heart_rate": return ("Heart Rate", "bpm")
    case "hrv": return ("HRV", "ms")
    case "weight": return ("Weight", "lb")
    case "glucose": return ("Glucose", "mg/dL")
    case "workout": return ("Training Load", "min")
    default: return (key.replacingOccurrences(of: "_", with: " ").capitalized, "")
    }
}

private func workoutActivityName(_ type: HKWorkoutActivityType) -> String {
    switch type {
    case .running:
        return "Running"
    case .walking:
        return "Walking"
    case .cycling:
        return "Cycling"
    case .hiking:
        return "Hiking"
    case .yoga:
        return "Yoga"
    case .functionalStrengthTraining:
        return "Strength Training"
    case .traditionalStrengthTraining:
        return "Strength Training"
    default:
        return "Workout"
    }
}

private func quantityType(for key: String) -> HKQuantityType? {
    switch key {
    case "steps":
        return HKQuantityType.quantityType(forIdentifier: .stepCount)
    case "heart_rate":
        return HKQuantityType.quantityType(forIdentifier: .heartRate)
    case "hrv":
        return HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN)
    case "weight":
        return HKQuantityType.quantityType(forIdentifier: .bodyMass)
    case "glucose":
        return HKQuantityType.quantityType(forIdentifier: .bloodGlucose)
    default:
        return nil
    }
}

private func categoryType(for key: String) -> HKCategoryType? {
    switch key {
    case "sleep":
        return HKCategoryType.categoryType(forIdentifier: .sleepAnalysis)
    default:
        return nil
    }
}

private func quantityUnit(for key: String) -> HKUnit {
    switch key {
    case "steps":
        return .count()
    case "heart_rate":
        return HKUnit.count().unitDivided(by: .minute())
    case "hrv":
        return HKUnit.secondUnit(with: .milli)
    case "weight":
        return .pound()
    case "glucose":
        return HKUnit(from: "mg/dL")
    default:
        return .count()
    }
}

private func sourceMode(_ request: BridgeRequest) -> String {
    request.sourceMode.lowercased()
}

private func defaultSince(_ request: BridgeRequest) -> Date {
    if let since = request.since {
        return Date(timeIntervalSince1970: since / 1000)
    }
    return Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date(timeIntervalSinceNow: -7 * 24 * 60 * 60)
}

private func sampleQueryResults(for type: HKSampleType, limit: Int = 1, descending: Bool = true) async throws -> [HKSample] {
    try await withCheckedThrowingContinuation { continuation in
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: !descending)
        let query = HKSampleQuery(sampleType: type, predicate: nil, limit: limit, sortDescriptors: [sort]) { _, samples, error in
            if let error = error {
                continuation.resume(throwing: error)
                return
            }
            continuation.resume(returning: samples ?? [])
        }
        healthStore.execute(query)
    }
}

private func latestQuantitySample(_ key: String) async throws -> (MetricPayload, RecordPayload?)? {
    guard let quantityType = quantityType(for: key) else { return nil }
    let samples = try await sampleQueryResults(for: quantityType, limit: 1)
    guard let sample = samples.first as? HKQuantitySample else { return nil }
    let label = makeMetricLabel(key)
    let value = sample.quantity.doubleValue(for: quantityUnit(for: key))
    let metric = MetricPayload(
        key: key,
        value: value,
        unit: label.1,
        label: label.0,
        recordedAt: sample.endDate.timeIntervalSince1970 * 1000
    )
    let record = RecordPayload(
        title: "\(label.0) Snapshot",
        summary: "\(label.0) recorded from HealthKit.",
        recordedAt: sample.endDate.timeIntervalSince1970 * 1000,
        sourceLabel: "Apple Health",
        kind: "wearable",
        tags: [key, "healthkit"]
    )
    return (metric, record)
}

private func aggregatedSteps(since: Date) async throws -> MetricPayload? {
    guard let quantityType = quantityType(for: "steps") else { return nil }
    return try await withCheckedThrowingContinuation { continuation in
        let query = HKStatisticsQuery(
            quantityType: quantityType,
            quantitySamplePredicate: HKQuery.predicateForSamples(withStart: since, end: Date(), options: .strictStartDate),
            options: .cumulativeSum
        ) { _, statistics, error in
            if let error = error {
                continuation.resume(throwing: error)
                return
            }
            let quantity = statistics?.sumQuantity()?.doubleValue(for: .count()) ?? 0
            continuation.resume(returning: MetricPayload(
                key: "steps",
                value: quantity,
                unit: "steps",
                label: "Steps",
                recordedAt: now()
            ))
        }
        healthStore.execute(query)
    }
}

private func aggregatedSleep(since: Date) async throws -> MetricPayload? {
    guard let categoryType = categoryType(for: "sleep") else { return nil }
    let samples = try await sampleQueryResults(for: categoryType, limit: HKObjectQueryNoLimit)
    let sleepSamples = samples.compactMap { $0 as? HKCategorySample }.filter { $0.endDate >= since }
    let minutes = sleepSamples.reduce(0.0) { total, sample in
        total + sample.endDate.timeIntervalSince(sample.startDate) / 60.0
    }
    guard minutes > 0 else { return nil }
    return MetricPayload(key: "sleep", value: minutes, unit: "min", label: "Sleep", recordedAt: now())
}

private func latestWorkout() async throws -> (MetricPayload, RecordPayload?)? {
    let sampleType = HKObjectType.workoutType()
    let samples = try await sampleQueryResults(for: sampleType, limit: 1)
    guard let workout = samples.first as? HKWorkout else { return nil }
    let minutes = max(1.0, workout.duration / 60.0)
    let metric = MetricPayload(key: "workout", value: minutes, unit: "min", label: "Training Load", recordedAt: workout.endDate.timeIntervalSince1970 * 1000)
    let record = RecordPayload(
        title: "Workout summary",
        summary: "\(workoutActivityName(workout.workoutActivityType)) workout, \(Int(minutes)) min.",
        recordedAt: workout.endDate.timeIntervalSince1970 * 1000,
        sourceLabel: "Apple Health",
        kind: "wearable",
        tags: ["workout", "healthkit"]
    )
    return (metric, record)
}

private func readSnapshot(request: BridgeRequest) async throws -> SyncData {
    guard sourceMode(request) == "native" else {
        return SyncData(
            permissions: PermissionSnapshot(read: false, write: false),
            readableTypes: [],
            writableTypes: [],
            metrics: [],
            records: [],
            sourceMode: "import",
            lastSyncedAt: now()
        )
    }

    let since = defaultSince(request)
    let requestedTypes = request.readTypes?.isEmpty == false ? request.readTypes! : readableTypes
    var metrics: [MetricPayload] = []
    var records: [RecordPayload] = []

    if requestedTypes.contains("steps"), let metric = try await aggregatedSteps(since: since) {
        metrics.append(metric)
    }
    if requestedTypes.contains("sleep"), let metric = try await aggregatedSleep(since: since) {
        metrics.append(metric)
    }
    if requestedTypes.contains("heart_rate"), let latest = try await latestQuantitySample("heart_rate") {
        let (metric, record) = latest
        metrics.append(metric)
        if let record = record { records.append(record) }
    }
    if requestedTypes.contains("hrv"), let latest = try await latestQuantitySample("hrv") {
        let (metric, record) = latest
        metrics.append(metric)
        if let record = record { records.append(record) }
    }
    if requestedTypes.contains("weight"), let latest = try await latestQuantitySample("weight") {
        let (metric, record) = latest
        metrics.append(metric)
        if let record = record { records.append(record) }
    }
    if requestedTypes.contains("glucose"), let latest = try await latestQuantitySample("glucose") {
        let (metric, record) = latest
        metrics.append(metric)
        if let record = record { records.append(record) }
    }
    if requestedTypes.contains("workout"), let latest = try await latestWorkout() {
        let (metric, record) = latest
        metrics.append(metric)
        if let record = record { records.append(record) }
    }

    return SyncData(
        permissions: PermissionSnapshot(
            read: !metrics.isEmpty || !records.isEmpty,
            write: true
        ),
        readableTypes: requestedTypes,
        writableTypes: writableTypes,
        metrics: metrics,
        records: records,
        sourceMode: "native",
        lastSyncedAt: now()
    )
}

private func requestAuthorization(request: BridgeRequest) async throws -> AuthorizationData {
    guard sourceMode(request) == "native" else {
        return AuthorizationData(
            granted: false,
            authorizationStatus: "import-only",
            readableTypes: [],
            writableTypes: [],
            sourceMode: request.sourceMode
        )
    }

    let readObjects: Set<HKObjectType> = Set((request.readTypes ?? readableTypes).compactMap { key in
        if let quantity = quantityType(for: key) { return quantity }
        if let category = categoryType(for: key) { return category }
        if key == "workout" { return HKObjectType.workoutType() }
        return nil
    })
    let writeObjects: Set<HKSampleType> = Set((request.writeTypes ?? writableTypes).compactMap { key in
        if let quantity = quantityType(for: key) { return quantity }
        if let category = categoryType(for: key) { return category }
        if key == "workout" { return HKObjectType.workoutType() }
        return nil
    })

    let groups: Set<HKObjectType> = readObjects.union(Set(writeObjects))
    guard !groups.isEmpty else {
        return AuthorizationData(
            granted: false,
            authorizationStatus: "not-determined",
            readableTypes: request.readTypes ?? [],
            writableTypes: request.writeTypes ?? [],
            sourceMode: request.sourceMode
        )
    }

    let granted = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Bool, Error>) in
        healthStore.requestAuthorization(toShare: writeObjects, read: groups) { success, error in
            if let error = error {
                continuation.resume(throwing: error)
                return
            }
            continuation.resume(returning: success)
        }
    }

    let status = granted ? "authorized" : "denied"
    return AuthorizationData(
        granted: granted,
        authorizationStatus: status,
        readableTypes: request.readTypes ?? readableTypes,
        writableTypes: request.writeTypes ?? writableTypes,
        sourceMode: request.sourceMode
    )
}

private func writeSamples(request: BridgeRequest) async throws -> WriteResult {
    guard sourceMode(request) == "native" else {
        throw BridgeRuntimeError.unavailable("Writeback is only available for native Apple Health connections.")
    }

    let items = request.items ?? []
    var samplesToSave: [HKSample] = []
    var warnings: [String] = []

    for item in items {
        switch item.type {
        case "steps", "heart_rate", "hrv", "weight", "glucose":
            guard let quantityType = quantityType(for: item.type) else { continue }
            let value = Double(item.value) ?? 0
            let unit = item.unit.flatMap { HKUnit(from: $0) } ?? quantityUnit(for: item.type)
            let quantity = HKQuantity(unit: unit, doubleValue: value)
            let timestamp = Date(timeIntervalSince1970: (item.endDate ?? item.startDate ?? now()) / 1000)
            let sample = HKQuantitySample(type: quantityType, quantity: quantity, start: timestamp, end: timestamp)
            samplesToSave.append(sample)
        case "sleep":
            guard let categoryType = categoryType(for: item.type) else { continue }
            let start = Date(timeIntervalSince1970: (item.startDate ?? now()) / 1000)
            let end = Date(timeIntervalSince1970: (item.endDate ?? item.startDate ?? now()) / 1000)
            let value = HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
            let sample = HKCategorySample(type: categoryType, value: value, start: start, end: end)
            samplesToSave.append(sample)
        case "workout":
            let start = Date(timeIntervalSince1970: (item.startDate ?? now()) / 1000)
            let end = Date(timeIntervalSince1970: (item.endDate ?? item.startDate ?? now()) / 1000)
            let duration = max(1.0, end.timeIntervalSince(start))
            let workout = HKWorkout(
                activityType: .running,
                start: start,
                end: end,
                duration: duration,
                totalEnergyBurned: nil,
                totalDistance: nil,
                metadata: [
                    HKMetadataKeyIndoorWorkout: true,
                    HKMetadataKeySyncIdentifier: item.id
                ]
            )
            samplesToSave.append(workout)
        default:
            warnings.append("Unsupported writeback type: \(item.type)")
        }
    }

    guard !samplesToSave.isEmpty else {
        return WriteResult(writtenCount: 0, warnings: warnings)
    }

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        healthStore.save(samplesToSave) { success, error in
            if let error = error {
                continuation.resume(throwing: error)
                return
            }
            if !success {
                continuation.resume(throwing: BridgeRuntimeError.writeFailed("HealthKit rejected the writeback request."))
                return
            }
            continuation.resume(returning: ())
        }
    }

    return WriteResult(writtenCount: samplesToSave.count, warnings: warnings)
}

private func errorMessage(_ error: BridgeRuntimeError) -> String {
    switch error {
    case .invalidRequest(let message),
         .unavailable(let message),
         .authorizationDenied(let message),
         .queryFailed(let message),
         .writeFailed(let message):
        return message
    }
}

private func runBridge() async {
    do {
        let request = try decodeRequest()
        let method = request.method.lowercased()
        switch method {
        case "status":
            emit(BridgeEnvelope<StatusData>.success(
                StatusData(
                    available: sourceMode(request) == "native",
                    authorizationStatus: sourceMode(request) == "native" ? "not-determined" : "import-only",
                    readableTypes: sourceMode(request) == "native" ? readableTypes : [],
                    writableTypes: sourceMode(request) == "native" ? writableTypes : [],
                    sourceMode: request.sourceMode,
                    lastSyncedAt: nil,
                    lastError: nil
                )
            ))
        case "authorize":
            let data = try await requestAuthorization(request: request)
            emit(BridgeEnvelope<AuthorizationData>.success(data))
        case "sync":
            let data = try await readSnapshot(request: request)
            emit(BridgeEnvelope<SyncData>.success(data))
        case "write":
            let data = try await writeSamples(request: request)
            emit(BridgeEnvelope<WriteResult>.success(data))
        default:
            emit(BridgeEnvelope<StatusData>.failure(code: "INVALID_METHOD", message: "Unsupported bridge method: \(request.method)"))
        }
    } catch let error as BridgeRuntimeError {
        emit(BridgeEnvelope<StatusData>.failure(code: "BRIDGE_ERROR", message: errorMessage(error)))
    } catch {
        emit(BridgeEnvelope<StatusData>.failure(code: "SWIFT_ERROR", message: error.localizedDescription))
    }
}

@main
struct HealthKitBridgeMain {
    static func main() async {
        if CommandLine.arguments.contains("--appkit") {
            let delegate = BridgeAppDelegate()
            let app = NSApplication.shared
            app.setActivationPolicy(.accessory)
            app.delegate = delegate
            app.run()
            return
        }

        await runBridge()
    }
}

private final class BridgeAppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.activate(ignoringOtherApps: true)
        Task {
            await runBridge()
        }
    }
}
