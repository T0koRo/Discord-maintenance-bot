require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let maintenanceSchedule = [];
let weeklySettings = null;
const CONFIG_FILE = path.join(__dirname, "config.json");

// 設定をファイルから読み込み
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, "utf8");
            const config = JSON.parse(data);
            
            // 週次設定の復元
            if (config.weeklySettings) {
                weeklySettings = config.weeklySettings;
                console.log("週次設定を復元しました:", weeklySettings);
            }
            
            // 単発メンテナンス予定の復元
            if (config.maintenanceSchedule) {
                maintenanceSchedule = config.maintenanceSchedule.map(item => ({
                    ...item,
                    maintenanceTime: new Date(item.maintenanceTime)
                }));
                console.log(`${maintenanceSchedule.length}件の単発メンテナンス予定を復元しました`);
            }
            
            console.log("設定ファイルの読み込み完了");
        } else {
            console.log("設定ファイルが存在しません。新規作成します。");
            saveConfig();
        }
    } catch (error) {
        console.error("設定ファイルの読み込みエラー:", error);
    }
}

// 設定をファイルに保存
function saveConfig() {
    try {
        const config = {
            weeklySettings: weeklySettings,
            maintenanceSchedule: maintenanceSchedule.map(item => ({
                ...item,
                maintenanceTime: item.maintenanceTime.toISOString()
            }))
        };
        
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
        console.log("設定をファイルに保存しました");
    } catch (error) {
        console.error("設定ファイルの保存エラー:", error);
    }
}

client.once("ready", () => {
    console.log(`${client.user.tag}としてログインしました！`);
    console.log(`参加サーバ数：${client.guilds.cache.size}`);
    
    // 設定ファイルの読み込み
    loadConfig();
    
    // 週次メンテナンスの復元
    if (weeklySettings) {
        // チャンネルオブジェクトを復元
        const channel = client.channels.cache.find(ch => ch.name === weeklySettings.channelName);
        if (channel) {
            weeklySettings.channel = channel;
            scheduleWeeklyMaintenance();
            console.log("週次メンテナンススケジュールを復元しました");
        } else {
            console.error(`チャンネル "${weeklySettings.channelName}" が見つかりません`);
        }
    }
    
    // 単発メンテナンスの復元
    restoreSingleMaintenanceSchedules();
});

// 単発メンテナンススケジュールの復元
function restoreSingleMaintenanceSchedules() {
    const now = new Date();
    
    maintenanceSchedule.forEach((schedule, index) => {
        const announceChannel = client.channels.cache.find(ch => ch.name === "サービスアナウンス");
        if (announceChannel && schedule.maintenanceTime > now) {
            // 30分前・10分前・開始通知を再スケジュール
            const thirtyMinBefore = new Date(schedule.maintenanceTime.getTime() - 30 * 60 * 1000);
            const tenMinBefore = new Date(schedule.maintenanceTime.getTime() - 10 * 60 * 1000);
            
            if (thirtyMinBefore > now) {
                const delay = thirtyMinBefore.getTime() - now.getTime();
                setTimeout(() => {
                    announceChannel.send("🔧 **【メンテナンス通知】** \n メンテナンス開始まであと30分です");
                }, delay);
                console.log(`単発メンテナンス30分前通知を復元: ${schedule.date} ${schedule.time}`);
            }
            
            if (tenMinBefore > now) {
                const delay = tenMinBefore.getTime() - now.getTime();
                setTimeout(() => {
                    announceChannel.send("🔧 **【メンテナンス通知】** \n メンテナンス開始まであと10分です");
                }, delay);
                console.log(`単発メンテナンス10分前通知を復元: ${schedule.date} ${schedule.time}`);
            }
            
            if (schedule.maintenanceTime > now) {
                const delay = schedule.maintenanceTime.getTime() - now.getTime();
                setTimeout(() => {
                    announceChannel.send("🔧 **【メンテナンス通知】** \n メンテナンスが開始します");
                }, delay);
                console.log(`単発メンテナンス開始通知を復元: ${schedule.date} ${schedule.time}`);
            }
        }
    });
    
    // 期限切れの予定を削除
    const validSchedules = maintenanceSchedule.filter(schedule => schedule.maintenanceTime > now);
    if (validSchedules.length !== maintenanceSchedule.length) {
        maintenanceSchedule = validSchedules;
        saveConfig();
        console.log("期限切れのメンテナンス予定を削除しました");
    }
}

client.on("messageCreate", (message) => {
    if (message.author.bot) return;

    // デバッグ用：全チャンネル名を表示
    if (message.content === "!debug-channels") {
        const channels = client.channels.cache.map(ch => ch.name).join(", ");
        message.reply(`利用可能なチャンネル: ${channels}`);
        return;
    }
    // ヘルプコマンド
if (message.content === "!help") {
    const helpMessage = `
**メンテナンスBot コマンド一覧**

**管理コマンド（maintenance-bot管理チャンネルのみ）**
\`!maintenance <開始日> <開始時刻> <終了日> <終了時刻> "<作業内容>" "<対象サーバ>"\`
  - 単発メンテナンス設定
  - 例: \`!maintenance 2025-08-22 10:00 2025-08-22 12:00 "データベース更新" "メインサーバ"\`
\`!weekly-maintenance <曜日> <開始時刻> <終了時刻>\`
  - 週次メンテナンス設定
  - 例: \`!weekly-maintenance saturday 10:00 11:00\`
\`!weekly-status\`
  - 週次メンテナンス設定確認
\`!schedule\`
  - 単発メンテナンス予定確認
\`!clear-schedule\`
  - 全メンテナンス予定削除
**一般コマンド（全チャンネル）**
\`!ping\`
  - Bot動作確認
\`!help\`
  - このヘルプを表示
**通知について**
- 設定完了通知: 設定直後にサービスアナウンスに送信
- 自動通知: 30分前・10分前・開始・終了時に送信
- 通知先: サービスアナウンスチャンネル`;

    message.reply(helpMessage);
    return;
}

    const channelName = message.channel.name;
    const isManagementChannel = channelName === "maintenance-bot管理";
    const announceChannel = client.channels.cache.find(ch => ch.name === "サービスアナウンス");

    if (message.content === "!ping") {
        message.reply("pong");
    }

    // 管理コマンドの制限
    if (!isManagementChannel && (
        message.content.startsWith("!maintenance ") ||
        message.content.startsWith("!weekly-maintenance ") ||
        message.content === "!weekly-status" ||
        message.content === "!schedule" ||
        message.content === "!clear-schedule"
    )) {
        message.reply("⚠️ このコマンドは `maintenance-bot管理` チャンネルでのみ使用できます");
        return;
    }

// 単発メンテナンス設定
if (message.content.startsWith("!maintenance ")) {
    const args = message.content.split(" ");
    if (args.length >= 6) {
        const date = args[1];
        const time = args[2];
        const endDate = args[3];
        const endTime = args[4];
        const summary = args[5].replace(/"/g, '');
        const targetServer = args[6].replace(/"/g, '');

        // 時刻の妥当性チェック
        function validateTime(timeStr) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
        }
        
        if (!validateTime(time) || !validateTime(endTime)) {
            message.reply("❌ 無効な時刻です。0:00-23:59の範囲で入力してください。");
            return;
        }
        if (!validateTimeOrder(time, endTime)) {
    message.reply("❌ 開始時刻は終了時刻より前である必要があります。");
    return;
}
        // 重複チェック（管理チャンネルに表示）
        const existingSchedule = maintenanceSchedule.find(schedule => 
            schedule.date === date && schedule.time === time
        );

        if (existingSchedule) {
            message.reply("⚠️ 同じ日時のメンテナンスが既に設定されています。");
            return; // 処理を停止
        }
        
        const targetChannel = announceChannel || message.channel;
        
        const maintenanceInfo = {
            date: date,
            time: time,
            endDate: endDate,
            endTime: endTime,
            summary: summary,
            targetServer: targetServer
        };
        
        scheduleMaintenanceWithDetails(targetChannel, maintenanceInfo);
        saveConfig();
        
        // 設定完了通知（正常時のみ実行される）
        targetChannel.send(`# 📅 【臨時メンテナンス予定通知】
予定開始日時：${date} ${time}
予定終了時刻：${endDate} ${endTime}
対象サーバー：**${targetServer}**
作業内容：${summary}

上記の日時において、**臨時メンテナンス**を実施いたします。
メンテナンス中は当該サーバは停止し、サービスをご利用いただけません。
また、作業の進捗状況によっては終了予定時刻が前後する可能性がございます。
その際は本チャンネルにて随時ご案内いたしますので、あらかじめご了承ください。`);
        
        message.reply(`メンテナンス通知を設定しました: ${date} ${time}`);
    } else {
        message.reply("使用例: !maintenance 2025-08-22 02:00 2025-08-22 03:00 \"データベース更新\" \"パルワールドサーバ\"");
    }
}

    // 週次メンテナンス設定
if (message.content.startsWith("!weekly-maintenance ")) {
    const args = message.content.split(" ");
    if (args.length >= 4) {
        const day = args[1];
        const startTime = args[2];
        const endTime = args[3];
        const targetChannel = announceChannel || message.channel;
        setupWeeklyMaintenance(targetChannel, day, startTime, endTime);
        saveConfig();
        const nextDate = getNextMaintenanceDate(day, startTime);
        function validateTime(timeStr) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
        }
        
        if (!validateTime(startTime) || !validateTime(endTime)) {
            message.reply("❌ 無効な時刻です。0:00-23:59の範囲で入力してください。");
            return;
        }

        // 時刻順序のチェックを追加
if (!validateTimeOrder(startTime, endTime)) {
    message.reply("❌ 開始時刻は終了時刻より前である必要があります。");
    return;
}
        
       // 設定完了通知
// 週次メンテナンス設定完了通知
        targetChannel.send(`# 📅 【定期メンテナンス予定通知】
予定開始日時：${nextDate.toLocaleDateString('ja-JP').replace(/\//g, '-')} ${startTime}
予定終了時刻：${nextDate.toLocaleDateString('ja-JP').replace(/\//g, '-')} ${endTime}
対象サーバー：**パルワールドサーバ**
作業内容：定期メンテナンス


上記の日時において、**定期メンテナンス**を実施いたします。
メンテナンス中は当該サーバが停止し、サービスをご利用いただけません。
また、作業の進捗状況によっては終了予定時刻が前後する可能性がございます。
その際は本チャンネルにて随時ご案内いたしますので、あらかじめご了承ください。
また、定期メンテナンスは毎週繰り返し行われます。`);
        
        message.reply(`週次メンテナンスを設定しました: 毎週${day} ${startTime}-${endTime}\n通知送信先: ${targetChannel.name}`);
    } else {
        message.reply("使用例: !weekly-maintenance saturday 10:00 11:00");
    }
}

    // 週次設定確認
    if (message.content === "!weekly-status") {
        if (weeklySettings) {
            const next = getNextMaintenanceDate(weeklySettings.day, weeklySettings.startTime);
            message.reply(`**週次メンテナンス設定**\n` +
                         `曜日: ${weeklySettings.day}\n` +
                         `時間: ${weeklySettings.startTime}-${weeklySettings.endTime}\n` +
                         `次回予定: ${next.toLocaleDateString('ja-JP')} ${weeklySettings.startTime}\n` +
                         `通知送信先: ${weeklySettings.channelName}`);
        } else {
            message.reply("週次メンテナンスは設定されていません");
        }
    }

    // 予定確認（単発）
    if (message.content === "!schedule") {
        if (maintenanceSchedule.length === 0) {
            message.reply("現在、単発メンテナンス予定はありません。");
        } else {
            let scheduleText = "**予定されている単発メンテナンス**\n";
            maintenanceSchedule.forEach((schedule, index) => {
                scheduleText += `${index + 1}. ${schedule.date} ${schedule.time}\n`;
            });
            message.reply(scheduleText);
        }
    }

    // 全予定クリア（管理用）
    if (message.content === "!clear-schedule") {
        maintenanceSchedule = [];
        weeklySettings = null;
        saveConfig();
        message.reply("全てのメンテナンス予定をクリアしました");
    }
});

// 週次メンテナンス設定
function setupWeeklyMaintenance(channel, day, startTime, endTime) {
    weeklySettings = {
        channel: channel,
        channelName: channel.name, // 永続化用
        day: day,
        startTime: startTime,
        endTime: endTime
    };
    
    console.log(`週次メンテナンス設定: ${day} ${startTime}-${endTime}`);
    scheduleWeeklyMaintenance();
}

// 週次メンテナンスのスケジュール実行
function scheduleWeeklyMaintenance() {
    if (!weeklySettings) return;
    
    const nextDate = getNextMaintenanceDate(weeklySettings.day, weeklySettings.startTime);
    const endDate = getNextMaintenanceDate(weeklySettings.day, weeklySettings.endTime);
    
    console.log(`次回週次メンテナンス: ${nextDate}`);
    console.log(`終了予定: ${endDate}`);
    
    scheduleMaintenanceNotifications(weeklySettings.channel, nextDate, endDate);
    
    const now = new Date();
    const delayToNextSchedule = endDate.getTime() - now.getTime();
    
    if (delayToNextSchedule > 0) {
        setTimeout(() => {
            console.log("次週のメンテナンスをスケジュール中...");
            scheduleWeeklyMaintenance();
        }, delayToNextSchedule);
    }
}

// 次回のメンテナンス日時を計算
function getNextMaintenanceDate(dayName, time) {
    const now = new Date();
    const days = {
        'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
        'thursday': 4, 'friday': 5, 'saturday': 6
    };
    
    const targetDay = days[dayName.toLowerCase()];
    const [hours, minutes] = time.split(':').map(Number);
    
    const today = now.getDay();
    let daysUntilTarget = targetDay - today;
    
    if (daysUntilTarget < 0 || (daysUntilTarget === 0 && now.getHours() >= hours)) {
        daysUntilTarget += 7;
    }
    
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysUntilTarget);
    targetDate.setHours(hours, minutes, 0, 0);
    
    return targetDate;
}

// メンテナンス通知をスケジュール
function scheduleMaintenanceNotifications(channel, startTime, endTime) {
    const now = new Date();
    
   // 30分前通知
const thirtyMinBefore = new Date(startTime.getTime() - 30 * 60 * 1000);
if (thirtyMinBefore > now) {
    const delay = thirtyMinBefore.getTime() - now.getTime();
    setTimeout(() => {
        channel.send(`${mention}

##【定期メンテナンス通知】
定期メンテナンス開始まで残り30分となりました。
開始時刻より当該サーバは停止し、サービスをご利用いただけなくなります。
進捗により終了時刻が前後する可能性がありますので、ご了承ください。`);
    }, delay);
}

// 10分前通知
const tenMinBefore = new Date(startTime.getTime() - 10 * 60 * 1000);
if (tenMinBefore > now) {
    const delay = tenMinBefore.getTime() - now.getTime();
    setTimeout(() => {
        channel.send(`${mention}

##【定期メンテナンス通知】
定期メンテナンス開始まで残り10分となりました。
開始時刻より当該サーバは停止し、サービスをご利用いただけなくなります。
進捗により終了時刻が前後する可能性がありますので、ご了承ください。`);
    }, delay);
}
    
    if (startTime > now) {
        const delay = startTime.getTime() - now.getTime();
        setTimeout(() => {
            channel.send("🚧 **【定期メンテナンス開始】** サーバーメンテナンスを開始します");
        }, delay);
        console.log(`開始通知を${Math.floor(delay/1000/60)}分後に設定`);
    }
    
    if (endTime > now) {
        const delay = endTime.getTime() - now.getTime();
        setTimeout(() => {
            channel.send("✅ **【定期メンテナンス完了】** サーバーメンテナンスが完了しました");
        }, delay);
        console.log(`終了通知を${Math.floor(delay/1000/60)}分後に設定`);
    }
}

// 単発メンテナンス機能
function scheduleMaintenance(channel, date, time) {
    const maintenanceTime = new Date(`${date}T${time}:00+09:00`);
    const now = new Date();

    const thirtyMinBefore = new Date(maintenanceTime.getTime() - 30 * 60 * 1000);
    const tenMinBefore = new Date(maintenanceTime.getTime() - 10 * 60 * 1000);

    console.log(`単発メンテナンス予定: ${maintenanceTime}`);

    maintenanceSchedule.push({
        date: date,
        time: time,
        maintenanceTime: maintenanceTime
    });

    // 30分前通知
if (thirtyMinBefore > now) {
    const delay = thirtyMinBefore.getTime() - now.getTime();
    setTimeout(() => {
        channel.send(`${mention}

##【臨時メンテナンス通知】
臨時メンテナンス開始まで残り30分となりました。
開始時刻より当該サーバは停止し、サービスをご利用いただけなくなります。
進捗により終了時刻が前後する可能性がありますので、ご了承ください。`);
    }, delay);
}

// 10分前通知
if (tenMinBefore > now) {
    const delay = tenMinBefore.getTime() - now.getTime();
    setTimeout(() => {
        channel.send(`${mention}

##【臨時メンテナンス通知】
臨時メンテナンス開始まで残り10分となりました。
開始時刻より当該サーバは停止し、サービスをご利用いただけなくなります。
進捗により終了時刻が前後する可能性がありますので、ご了承ください。`);
    }, delay);
}
    
    if (maintenanceTime > now) {
        const delay = maintenanceTime.getTime() - now.getTime();
        setTimeout(() => {
            channel.send("🔧 **【メンテナンス通知】** 臨時メンテナンスが開始します");
        }, delay);
    }
}
// メンション文字列生成関数
function getMentionString(mentionType) {
    console.log("メンション種別:", mentionType); // デバッグ用
    switch(mentionType.toLowerCase()) {
        case 'everyone':
            console.log("@everyone を返します"); // デバッグ用
            return '@everyone';
        case 'here':
            console.log("@here を返します"); // デバッグ用
            return '@here';
        default:
            console.log("メンションなし"); // デバッグ用
            return '';
    }
}

// 詳細情報付きメンテナンススケジュール関数
function scheduleMaintenanceWithDetails(channel, maintenanceInfo) {
    const maintenanceTime = new Date(`${maintenanceInfo.date}T${maintenanceInfo.time}:00+09:00`);
    const now = new Date();

    if (isNaN(maintenanceTime.getTime())) {
        console.error("無効な日付です:", maintenanceInfo.date, maintenanceInfo.time);
        return;
    }

    maintenanceSchedule.push({
        ...maintenanceInfo,
        maintenanceTime: maintenanceTime
    });

    const thirtyMinBefore = new Date(maintenanceTime.getTime() - 30 * 60 * 1000);
    const tenMinBefore = new Date(maintenanceTime.getTime() - 10 * 60 * 1000);

    // 30分前通知
    if (thirtyMinBefore > now) {
        const delay = thirtyMinBefore.getTime() - now.getTime();
        setTimeout(() => {
            channel.send(`
## 📅 【臨時メンテナンス通知】
メンテナンス開始まであと30分です
対象サーバー：**${maintenanceInfo.targetServer}**
作業内容：${maintenanceInfo.summary}
終了時刻：${maintenanceInfo.endDate} ${maintenanceInfo.endTime}
`);
        }, delay);
    }

    // 10分前通知
    if (tenMinBefore > now) {
        const delay = tenMinBefore.getTime() - now.getTime();
        setTimeout(() => {
            channel.send(`
## 📅 【臨時メンテナンス通知】
メンテナンス開始まであと10分です
対象サーバー：**${maintenanceInfo.targetServer}**
作業内容：${maintenanceInfo.summary}
終了時刻：${maintenanceInfo.endDate} ${maintenanceInfo.endTime}
`);
        }, delay);
    }

    // 開始通知
    if (maintenanceTime > now) {
        const delay = maintenanceTime.getTime() - now.getTime();
        setTimeout(() => {
            channel.send(`
## 📅 【臨時メンテナンス開始】
サーバーメンテナンスを開始します
対象サーバー：**${maintenanceInfo.targetServer}**
終了時刻：${maintenanceInfo.endDate} ${maintenanceInfo.endTime}
作業の進捗状況によっては終了予定時刻が前後する可能性がございます。ご了承ください。`);
            }, delay);
    }
}
// 時刻検証関数を拡張
function validateTimeOrder(startTime, endTime) {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;
    
    return startTotalMinutes < endTotalMinutes;
}

client.login(process.env.DISCORD_TOKEN);