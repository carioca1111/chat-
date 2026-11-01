GuestAutoLogin = {}

local HOST = 'dbo-rox-game-alpha01.onrender.com'
local PORT = 443
local CLIENT_VERSION = 860
local ACCOUNT = 'guest'
local PASSWORD = 'guest'
local CHARACTER = 'Guest'
local WORLD = 'Dragon Ball Guest'
local retryEvent = nil
local attempts = 0
local stopped = false

local function cancelRetry()
    if retryEvent then
        removeEvent(retryEvent)
        retryEvent = nil
    end
end

local function scheduleRetry(delay)
    cancelRetry()
    if stopped or g_game.isOnline() then
        return
    end
    retryEvent = scheduleEvent(GuestAutoLogin.connect, delay or 500)
end

function GuestAutoLogin.connect()
    retryEvent = nil
    if stopped or g_game.isOnline() or g_game.isLogging() then
        return
    end

    attempts = attempts + 1

    if EnterGame then
        EnterGame.hide()
    end
    if CharacterList and CharacterList.isVisible and CharacterList.isVisible() then
        CharacterList.hide(false)
    end

    if g_game.getClientVersion() ~= CLIENT_VERSION then
        g_game.setClientVersion(CLIENT_VERSION)
        g_game.setProtocolVersion(g_game.getClientProtocolVersion(CLIENT_VERSION))
        g_game.chooseRsa(HOST)
        g_settings.set('client-version', CLIENT_VERSION)
        scheduleRetry(350)
        return
    end

    if not modules.game_things.isLoaded() then
        if attempts < 80 then
            scheduleRetry(250)
        else
            g_logger.error('[Guest] DBO Rox 8.60 DAT/SPR did not finish loading')
        end
        return
    end

    G.account = ACCOUNT
    G.password = PASSWORD
    G.authenticatorToken = ''
    G.sessionKey = ''
    G.host = HOST
    G.port = PORT

    g_logger.info('[Guest] entering DBO Rox world directly as Guest')
    g_game.loginWorld(ACCOUNT, PASSWORD, WORLD, HOST, PORT, CHARACTER, '', '')
end

function GuestAutoLogin.onGameStart()
    cancelRetry()
    attempts = 0
    g_logger.info('[Guest] entered world successfully')
end

function GuestAutoLogin.onGameEnd()
    if not stopped then
        scheduleRetry(1500)
    end
end

function GuestAutoLogin.init()
    stopped = false
    connect(g_game, {
        onGameStart = GuestAutoLogin.onGameStart,
        onGameEnd = GuestAutoLogin.onGameEnd
    })
    scheduleRetry(600)
end

function GuestAutoLogin.terminate()
    stopped = true
    cancelRetry()
    disconnect(g_game, {
        onGameStart = GuestAutoLogin.onGameStart,
        onGameEnd = GuestAutoLogin.onGameEnd
    })
end
