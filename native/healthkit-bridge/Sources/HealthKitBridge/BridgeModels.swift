import Foundation

struct BridgeErrorPayload: Codable {
    let code: String
    let message: String
    let details: String?
}

struct BridgeEnvelope<T: Codable>: Codable {
    let ok: Bool
    let data: T?
    let error: BridgeErrorPayload?

    static func success(_ data: T) -> BridgeEnvelope<T> {
        BridgeEnvelope(ok: true, data: data, error: nil)
    }

    static func failure(code: String, message: String, details: String? = nil) -> BridgeEnvelope<T> {
        BridgeEnvelope(ok: false, data: nil, error: BridgeErrorPayload(code: code, message: message, details: details))
    }
}

struct BridgeRequest: Codable {
    let method: String
    let sourceId: String?
    let sourceMode: String
    let readTypes: [String]?
    let writeTypes: [String]?
    let since: Double?
    let items: [WritebackItem]?
}

struct PermissionSnapshot: Codable {
    let read: Bool
    let write: Bool
}

struct StatusData: Codable {
    let available: Bool
    let authorizationStatus: String
    let readableTypes: [String]
    let writableTypes: [String]
    let sourceMode: String
    let lastSyncedAt: Double?
    let lastError: String?
}

struct AuthorizationData: Codable {
    let granted: Bool
    let authorizationStatus: String
    let readableTypes: [String]
    let writableTypes: [String]
    let sourceMode: String
}

struct MetricPayload: Codable {
    let key: String
    let value: Double
    let unit: String
    let label: String
    let recordedAt: Double
}

struct RecordPayload: Codable {
    let title: String
    let summary: String
    let recordedAt: Double
    let sourceLabel: String
    let kind: String
    let tags: [String]
}

struct SyncData: Codable {
    let permissions: PermissionSnapshot
    let readableTypes: [String]
    let writableTypes: [String]
    let metrics: [MetricPayload]
    let records: [RecordPayload]
    let sourceMode: String
    let lastSyncedAt: Double
}

struct WritebackItem: Codable {
    let id: String
    let type: String
    let label: String
    let value: String
    let unit: String?
    let startDate: Double?
    let endDate: Double?
    let sourceId: String?
}

struct WriteResult: Codable {
    let writtenCount: Int
    let warnings: [String]
}
