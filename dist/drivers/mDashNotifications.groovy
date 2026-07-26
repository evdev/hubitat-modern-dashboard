/**
 * mDash Notifications — Modern Dashboard companion driver
 *
 * Receives Hubitat Notification capability messages (Rule Machine, HSM, apps)
 * for display as popups on the Modern Dashboard PWA.
 *
 * Setup (recommended):
 *   1. Install Modern Dashboard via Hubitat Package Manager (installs this driver).
 *   2. Apps → Modern Dashboard → Notifications → Create mDash Notifications device.
 *   3. Target that device from Rule Machine or other apps (Send Notification).
 *
 * Manual driver install: Drivers Code → New Driver → paste → Save, then use the
 * in-app Create button above (or Devices → Add Virtual Device → mDash Notifications).
 */

metadata {
    definition(
        name: "mDash Notifications",
        namespace: "mDash",
        author: "Ephrayim (evdev)",
        importUrl: "https://raw.githubusercontent.com/evdev/hubitat-modern-dashboard/master/drivers/mDashNotifications.groovy"
    ) {
        capability "Notification"
        capability "Actuator"

        attribute "notificationText", "string"
        attribute "lastMessage", "string"
    }

    preferences {
        input name: "txtEnable", type: "bool", title: "Enable descriptionText logging", defaultValue: true
    }
}

def installed() {
    log.info "mDash Notifications installed"
}

def updated() {
    log.info "mDash Notifications updated"
}

def deviceNotification(text) {
    def msg = text?.toString() ?: ""
    if (msg.size() > 1024) msg = msg.take(1024)
    if (txtEnable) log.info "deviceNotification: ${msg}"
    // One subscriber-visible event only. Emitting lastMessage as a second isStateChange
    // event would enqueue the same popup twice in Modern Dashboard.
    sendEvent(name: "notificationText", value: msg, isStateChange: true, descriptionText: msg)
    sendEvent(name: "lastMessage", value: msg, isStateChange: false, displayed: false)
}
