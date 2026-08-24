import Foundation
import AVFoundation
import CoreLocation
import Combine
import UIKit

/// Connection states for the Control Plane WebSocket
enum ConnectionState: String {
    case disconnected
    case connecting
    case authenticating
    case connected
    case reconnecting
}

/// Manages the WebSocket connection to the NeoWorker Control Plane.
/// Handles authentication, command dispatch, and auto-reconnection.
class NeoWorkerConnection: NSObject, ObservableObject, URLSessionWebSocketDelegate, CLLocationManagerDelegate {

    // MARK: - Published State

    @Published var state: ConnectionState = .disconnected
    @Published var lastCommand: String = ""
    @Published var commandCount: Int = 0
    @Published var errorMessage: String?

    // MARK: - Settings (persisted via UserDefaults)

    @Published var serverHost: String {
        didSet { UserDefaults.standard.set(serverHost, forKey: "neoworker_host") }
    }
    @Published var serverPort: Int {
        didSet { UserDefaults.standard.set(serverPort, forKey: "neoworker_port") }
    }
    @Published var token: String {
        didSet { UserDefaults.standard.set(token, forKey: "neoworker_token") }
    }
    @Published var autoReconnect: Bool {
        didSet { UserDefaults.standard.set(autoReconnect, forKey: "neoworker_auto_reconnect") }
    }

    // MARK: - Private

    private var webSocket: URLSessionWebSocketTask?
    private var session: URLSession?
    private let locationManager = CLLocationManager()
    private var pendingLocationRequestId: String?
    private var reconnectAttempt = 0
    private let maxReconnectAttempt = 10
    private var reconnectTimer: Timer?
    private var isForeground = true

    // MARK: - Init

    override init() {
        self.serverHost = UserDefaults.standard.string(forKey: "neoworker_host") ?? ""
        self.serverPort = UserDefaults.standard.integer(forKey: "neoworker_port").nonZero ?? 18789
        self.token = UserDefaults.standard.string(forKey: "neoworker_token") ?? ""
        self.autoReconnect = UserDefaults.standard.bool(forKey: "neoworker_auto_reconnect")

        super.init()

        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest

        // Track foreground/background transitions
        NotificationCenter.default.addObserver(
            self, selector: #selector(appDidEnterBackground),
            name: UIApplication.didEnterBackgroundNotification, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(appWillEnterForeground),
            name: UIApplication.willEnterForegroundNotification, object: nil
        )
    }

    // MARK: - Connection Lifecycle

    func connect() {
        guard !serverHost.isEmpty, !token.isEmpty else {
            errorMessage = "Server host and token are required"
            return
        }

        disconnect(cleanly: false)

        state = .connecting
        errorMessage = nil

        let url = URL(string: "ws://\(serverHost):\(serverPort)")!
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        session = URLSession(configuration: config, delegate: self, delegateQueue: .main)
        webSocket = session?.webSocketTask(with: url)
        webSocket?.resume()
        receiveMessage()
    }

    func disconnect(cleanly: Bool = true) {
        reconnectTimer?.invalidate()
        reconnectTimer = nil
        reconnectAttempt = 0
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        session?.invalidateAndCancel()
        session = nil
        if cleanly {
            state = .disconnected
        }
    }

    // MARK: - Auto-Reconnect

    private func scheduleReconnect() {
        guard autoReconnect, reconnectAttempt < maxReconnectAttempt else {
            state = .disconnected
            return
        }

        state = .reconnecting
        reconnectAttempt += 1
        let delay = min(pow(2.0, Double(reconnectAttempt)), 60.0) // Exponential backoff, max 60s
        reconnectTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            self?.connect()
        }
    }

    // MARK: - Foreground/Background

    @objc private func appDidEnterBackground() {
        isForeground = false
        sendForegroundState(false)
    }

    @objc private func appWillEnterForeground() {
        isForeground = true
        sendForegroundState(true)
    }

    private func sendForegroundState(_ foreground: Bool) {
        guard state == .connected else { return }
        let frame: [String: Any] = [
            "type": "req",
            "id": UUID().uuidString,
            "method": "node.event",
            "params": [
                "event": "foreground_changed",
                "payload": ["isForeground": foreground]
            ]
        ]
        sendJSON(frame)
    }

    // MARK: - Authentication

    private func authenticate() {
        state = .authenticating

        let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        let deviceName = UIDevice.current.name
        let modelId = {
            var systemInfo = utsname()
            uname(&systemInfo)
            return withUnsafePointer(to: &systemInfo.machine) {
                $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                    String(validatingUTF8: $0) ?? UIDevice.current.model
                }
            }
        }()

        let cameraAuth = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
        let locationAuth = CLLocationManager.authorizationStatus() == .authorizedWhenInUse ||
                          CLLocationManager.authorizationStatus() == .authorizedAlways

        let frame: [String: Any] = [
            "type": "req",
            "id": UUID().uuidString,
            "method": "connect",
            "params": [
                "token": token,
                "role": "node",
                "client": [
                    "id": deviceId,
                    "displayName": deviceName,
                    "version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0",
                    "platform": "ios",
                    "modelIdentifier": modelId
                ],
                "capabilities": ["camera", "location", "system"],
                "commands": ["camera.snap", "location.get", "system.notify"],
                "permissions": [
                    "camera": cameraAuth,
                    "location": locationAuth
                ]
            ] as [String: Any]
        ]

        sendJSON(frame)
    }

    // MARK: - Message Handling

    private func receiveMessage() {
        webSocket?.receive { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let message):
                    switch message {
                    case .string(let text):
                        self?.handleMessage(text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            self?.handleMessage(text)
                        }
                    @unknown default:
                        break
                    }
                    self?.receiveMessage()

                case .failure(let error):
                    if self?.state != .disconnected {
                        self?.errorMessage = error.localizedDescription
                        self?.scheduleReconnect()
                    }
                }
            }
        }
    }

    private func handleMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }

        let type = json["type"] as? String ?? ""

        switch type {
        case "res":
            handleResponse(json)
        case "req":
            handleRequest(json)
        case "event":
            handleEvent(json)
        default:
            break
        }
    }

    private func handleResponse(_ json: [String: Any]) {
        if let ok = json["ok"] as? Bool, ok {
            if state == .authenticating {
                state = .connected
                reconnectAttempt = 0
                errorMessage = nil
            }
        } else {
            let msg = (json["error"] as? [String: Any])?["message"] as? String ?? "Unknown error"
            errorMessage = msg
            if state == .authenticating {
                state = .disconnected
            }
        }
    }

    private func handleEvent(_ json: [String: Any]) {
        // Handle heartbeat and other events silently
    }

    // MARK: - Command Dispatch

    private func handleRequest(_ json: [String: Any]) {
        guard let method = json["method"] as? String,
              let requestId = json["id"] as? String else { return }

        guard method == "node.invoke",
              let params = json["params"] as? [String: Any],
              let command = params["command"] as? String else {
            sendError(requestId: requestId, code: "UNKNOWN_METHOD", message: "Unknown method: \(method)")
            return
        }

        lastCommand = command
        commandCount += 1
        let cmdParams = params["params"] as? [String: Any]

        switch command {
        case "camera.snap":
            handleCameraSnap(requestId: requestId, params: cmdParams)
        case "location.get":
            handleLocationGet(requestId: requestId, params: cmdParams)
        case "system.notify":
            handleSystemNotify(requestId: requestId, params: cmdParams)
        default:
            sendError(requestId: requestId, code: "COMMAND_NOT_SUPPORTED", message: "Unsupported: \(command)")
        }
    }

    // MARK: - Camera

    private func handleCameraSnap(requestId: String, params: [String: Any]?) {
        guard isForeground else {
            sendError(requestId: requestId, code: "NODE_BACKGROUND_UNAVAILABLE", message: "App must be in foreground")
            return
        }

        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            sendError(requestId: requestId, code: "PERMISSION_DENIED", message: "Camera permission not granted")
            return
        }

        let facing = params?["facing"] as? String ?? "back"
        let maxWidth = params?["maxWidth"] as? Int ?? 1920
        let quality = params?["quality"] as? Double ?? 0.8

        let position: AVCaptureDevice.Position = facing == "front" ? .front : .back
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position) else {
            sendError(requestId: requestId, code: "CAMERA_ERROR", message: "Camera not available")
            return
        }

        // Use AVCaptureSession for a quick still capture
        let captureSession = AVCaptureSession()
        captureSession.sessionPreset = .photo

        guard let input = try? AVCaptureDeviceInput(device: device) else {
            sendError(requestId: requestId, code: "CAMERA_ERROR", message: "Cannot access camera input")
            return
        }
        captureSession.addInput(input)

        let photoOutput = AVCapturePhotoOutput()
        captureSession.addOutput(photoOutput)

        let delegate = PhotoCaptureDelegate(
            requestId: requestId,
            maxWidth: maxWidth,
            quality: quality,
            connection: self
        )

        captureSession.startRunning()

        let settings = AVCapturePhotoSettings()
        photoOutput.capturePhoto(with: settings, delegate: delegate)

        // Keep session alive until capture completes
        objc_setAssociatedObject(delegate, "session", captureSession, .OBJC_ASSOCIATION_RETAIN)
    }

    func sendCameraResult(requestId: String, imageData: Data, width: Int, height: Int) {
        let response: [String: Any] = [
            "type": "res",
            "id": requestId,
            "ok": true,
            "payload": [
                "format": "jpeg",
                "base64": imageData.base64EncodedString(),
                "width": width,
                "height": height
            ]
        ]
        sendJSON(response)
    }

    // MARK: - Location

    private func handleLocationGet(requestId: String, params: [String: Any]?) {
        let authStatus = CLLocationManager.authorizationStatus()
        guard authStatus == .authorizedWhenInUse || authStatus == .authorizedAlways else {
            sendError(requestId: requestId, code: "PERMISSION_DENIED", message: "Location permission not granted")
            return
        }

        pendingLocationRequestId = requestId
        let accuracy = params?["accuracy"] as? String ?? "precise"
        locationManager.desiredAccuracy = accuracy == "coarse"
            ? kCLLocationAccuracyHundredMeters
            : kCLLocationAccuracyBest
        locationManager.requestLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let requestId = pendingLocationRequestId, let location = locations.last else { return }
        pendingLocationRequestId = nil

        let response: [String: Any] = [
            "type": "res",
            "id": requestId,
            "ok": true,
            "payload": [
                "latitude": location.coordinate.latitude,
                "longitude": location.coordinate.longitude,
                "accuracy": location.horizontalAccuracy,
                "altitude": location.altitude,
                "timestamp": Int(location.timestamp.timeIntervalSince1970 * 1000)
            ]
        ]
        sendJSON(response)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard let requestId = pendingLocationRequestId else { return }
        pendingLocationRequestId = nil
        sendError(requestId: requestId, code: "LOCATION_ERROR", message: error.localizedDescription)
    }

    // MARK: - System Notify

    private func handleSystemNotify(requestId: String, params: [String: Any]?) {
        let title = params?["title"] as? String ?? "NeoWorker"
        let message = params?["message"] as? String ?? ""

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = message
        if params?["sound"] as? Bool != false {
            content.sound = .default
        }

        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { [weak self] error in
            DispatchQueue.main.async {
                if let error = error {
                    self?.sendError(requestId: requestId, code: "NOTIFY_ERROR", message: error.localizedDescription)
                } else {
                    self?.sendJSON([
                        "type": "res",
                        "id": requestId,
                        "ok": true,
                        "payload": ["delivered": true]
                    ])
                }
            }
        }
    }

    // MARK: - WebSocket Helpers

    func sendJSON(_ dict: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let text = String(data: data, encoding: .utf8) else { return }
        webSocket?.send(.string(text)) { error in
            if let error = error {
                print("[NeoWorker] Send error: \(error)")
            }
        }
    }

    func sendError(requestId: String, code: String, message: String) {
        sendJSON([
            "type": "res",
            "id": requestId,
            "ok": false,
            "error": ["code": code, "message": message]
        ])
    }

    // MARK: - URLSessionWebSocketDelegate

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol proto: String?) {
        authenticate()
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        if state != .disconnected {
            scheduleReconnect()
        }
    }
}

// MARK: - Photo Capture Delegate

import UserNotifications

class PhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {
    let requestId: String
    let maxWidth: Int
    let quality: Double
    weak var connection: NeoWorkerConnection?

    init(requestId: String, maxWidth: Int, quality: Double, connection: NeoWorkerConnection) {
        self.requestId = requestId
        self.maxWidth = maxWidth
        self.quality = quality
        self.connection = connection
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        // Stop the capture session
        if let session = objc_getAssociatedObject(self, "session") as? AVCaptureSession {
            session.stopRunning()
        }

        guard error == nil, let data = photo.fileDataRepresentation(), let image = UIImage(data: data) else {
            connection?.sendError(requestId: requestId, code: "CAMERA_ERROR", message: error?.localizedDescription ?? "Capture failed")
            return
        }

        // Resize if needed
        var finalImage = image
        if Int(image.size.width) > maxWidth {
            let scale = CGFloat(maxWidth) / image.size.width
            let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            UIGraphicsBeginImageContextWithOptions(newSize, false, 1.0)
            image.draw(in: CGRect(origin: .zero, size: newSize))
            finalImage = UIGraphicsGetImageFromCurrentImageContext() ?? image
            UIGraphicsEndImageContext()
        }

        guard let jpegData = finalImage.jpegData(compressionQuality: CGFloat(quality)) else {
            connection?.sendError(requestId: requestId, code: "CAMERA_ERROR", message: "JPEG conversion failed")
            return
        }

        connection?.sendCameraResult(
            requestId: requestId,
            imageData: jpegData,
            width: Int(finalImage.size.width),
            height: Int(finalImage.size.height)
        )
    }
}

// MARK: - Helpers

private extension Int {
    var nonZero: Int? { self == 0 ? nil : self }
}
