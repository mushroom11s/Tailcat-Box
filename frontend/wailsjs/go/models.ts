export namespace adapter {
	
	export class FileEntry {
	    Name: string;
	    IsDir: boolean;
	    Size: number;
	    Mode: string;
	    // Go type: time
	    ModTime: any;
	
	    static createFrom(source: any = {}) {
	        return new FileEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.IsDir = source["IsDir"];
	        this.Size = source["Size"];
	        this.Mode = source["Mode"];
	        this.ModTime = this.convertValues(source["ModTime"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PortMapping {
	    LocalPort: number;
	    RemoteHost: string;
	    RemotePort: number;
	
	    static createFrom(source: any = {}) {
	        return new PortMapping(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.LocalPort = source["LocalPort"];
	        this.RemoteHost = source["RemoteHost"];
	        this.RemotePort = source["RemotePort"];
	    }
	}

}

export namespace main {
	
	export class ClientInfo {
	    StartedAt: string;
	    AppVersion: string;
	    TailcatVersion: string;
	    LastUpdateCheck: string;
	
	    static createFrom(source: any = {}) {
	        return new ClientInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.StartedAt = source["StartedAt"];
	        this.AppVersion = source["AppVersion"];
	        this.TailcatVersion = source["TailcatVersion"];
	        this.LastUpdateCheck = source["LastUpdateCheck"];
	    }
	}
	export class MiaoFileInput {
	    name: string;
	    path: string;
	    dataBase64: string;
	
	    static createFrom(source: any = {}) {
	        return new MiaoFileInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.dataBase64 = source["dataBase64"];
	    }
	}
	export class SSHPeer {
	    Name: string;
	    Address: string;
	
	    static createFrom(source: any = {}) {
	        return new SSHPeer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Address = source["Address"];
	    }
	}
	export class SSHDeskStatus {
	    Enabled: boolean;
	    AllowAny: boolean;
	    Address: string;
	    SessionID: string;
	    Peers: SSHPeer[];
	    RoomPeers: string[];
	    Status: string;
	    Err: string;
	
	    static createFrom(source: any = {}) {
	        return new SSHDeskStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Enabled = source["Enabled"];
	        this.AllowAny = source["AllowAny"];
	        this.Address = source["Address"];
	        this.SessionID = source["SessionID"];
	        this.Peers = this.convertValues(source["Peers"], SSHPeer);
	        this.RoomPeers = source["RoomPeers"];
	        this.Status = source["Status"];
	        this.Err = source["Err"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SystemInfo {
	    OSVersion: string;
	    LaunchAtLogin: boolean;
	    LaunchAtLoginSupported: boolean;
	    NetworkOnline: boolean;
	    NetworkSummary: string;
	
	    static createFrom(source: any = {}) {
	        return new SystemInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.OSVersion = source["OSVersion"];
	        this.LaunchAtLogin = source["LaunchAtLogin"];
	        this.LaunchAtLoginSupported = source["LaunchAtLoginSupported"];
	        this.NetworkOnline = source["NetworkOnline"];
	        this.NetworkSummary = source["NetworkSummary"];
	    }
	}
	export class UpdateStatus {
	    CurrentVersion: string;
	    LatestVersion: string;
	    LatestTag: string;
	    UpdateAvailable: boolean;
	    Notes: string;
	    ReleaseURL: string;
	    AssetName: string;
	    DownloadURL: string;
	    LastChecked: string;
	    Status: string;
	    Error: string;
	    DownloadedPath: string;
	    ProgressPercent: number;
	    Platform: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.CurrentVersion = source["CurrentVersion"];
	        this.LatestVersion = source["LatestVersion"];
	        this.LatestTag = source["LatestTag"];
	        this.UpdateAvailable = source["UpdateAvailable"];
	        this.Notes = source["Notes"];
	        this.ReleaseURL = source["ReleaseURL"];
	        this.AssetName = source["AssetName"];
	        this.DownloadURL = source["DownloadURL"];
	        this.LastChecked = source["LastChecked"];
	        this.Status = source["Status"];
	        this.Error = source["Error"];
	        this.DownloadedPath = source["DownloadedPath"];
	        this.ProgressPercent = source["ProgressPercent"];
	        this.Platform = source["Platform"];
	    }
	}

}

export namespace miao {
	
	export class FileInfo {
	    name: string;
	    size: number;
	    sha256: string;
	
	    static createFrom(source: any = {}) {
	        return new FileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.size = source["size"];
	        this.sha256 = source["sha256"];
	    }
	}
	export class SavedFile {
	    name: string;
	    size: number;
	    path: string;
	    sha256: string;
	
	    static createFrom(source: any = {}) {
	        return new SavedFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.size = source["size"];
	        this.path = source["path"];
	        this.sha256 = source["sha256"];
	    }
	}
	export class Receipt {
	    files: SavedFile[];
	
	    static createFrom(source: any = {}) {
	        return new Receipt(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.files = this.convertValues(source["files"], SavedFile);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ReceiveJob {
	    id: string;
	    status: string;
	    bytesDone: number;
	    bytesTotal: number;
	    files: FileInfo[];
	    saved?: SavedFile[];
	    error?: string;
	    dest: string;
	    payload?: string;
	    resumable?: boolean;
	    expiresAt?: string;
	    peerPath?: string;
	    relaySource?: string;
	    relayName?: string;
	
	    static createFrom(source: any = {}) {
	        return new ReceiveJob(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.status = source["status"];
	        this.bytesDone = source["bytesDone"];
	        this.bytesTotal = source["bytesTotal"];
	        this.files = this.convertValues(source["files"], FileInfo);
	        this.saved = this.convertValues(source["saved"], SavedFile);
	        this.error = source["error"];
	        this.dest = source["dest"];
	        this.payload = source["payload"];
	        this.resumable = source["resumable"];
	        this.expiresAt = source["expiresAt"];
	        this.peerPath = source["peerPath"];
	        this.relaySource = source["relaySource"];
	        this.relayName = source["relayName"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Snapshot {
	    id: string;
	    address: string;
	    token: string;
	    payload: string;
	    files: FileInfo[];
	    total: number;
	    forever: boolean;
	    ttlDays: number;
	    expiresAt: string;
	    maxDownloads: number;
	    downloads: number;
	    status: string;
	    endReason: string;
	    createdAt: string;
	    listening: boolean;
	    byRef?: boolean;
	    warning?: string;
	    peerPath?: string;
	    relaySource?: string;
	    relayName?: string;
	    bytesDone?: number;
	    bytesTotal?: number;
	
	    static createFrom(source: any = {}) {
	        return new Snapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.address = source["address"];
	        this.token = source["token"];
	        this.payload = source["payload"];
	        this.files = this.convertValues(source["files"], FileInfo);
	        this.total = source["total"];
	        this.forever = source["forever"];
	        this.ttlDays = source["ttlDays"];
	        this.expiresAt = source["expiresAt"];
	        this.maxDownloads = source["maxDownloads"];
	        this.downloads = source["downloads"];
	        this.status = source["status"];
	        this.endReason = source["endReason"];
	        this.createdAt = source["createdAt"];
	        this.listening = source["listening"];
	        this.byRef = source["byRef"];
	        this.warning = source["warning"];
	        this.peerPath = source["peerPath"];
	        this.relaySource = source["relaySource"];
	        this.relayName = source["relayName"];
	        this.bytesDone = source["bytesDone"];
	        this.bytesTotal = source["bytesTotal"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace session {
	
	export class Session {
	    ID: string;
	    Kind: string;
	    Status: string;
	    Address: string;
	    // Go type: time
	    CreatedAt: any;
	    Err: string;
	    Progress: string;
	    Dangerous: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Session(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Kind = source["Kind"];
	        this.Status = source["Status"];
	        this.Address = source["Address"];
	        this.CreatedAt = this.convertValues(source["CreatedAt"], null);
	        this.Err = source["Err"];
	        this.Progress = source["Progress"];
	        this.Dangerous = source["Dangerous"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace store {
	
	export class KeyInfo {
	    Name: string;
	    Path: string;
	    Client: boolean;
	    Address: string;
	    Source: string;
	
	    static createFrom(source: any = {}) {
	        return new KeyInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Path = source["Path"];
	        this.Client = source["Client"];
	        this.Address = source["Address"];
	        this.Source = source["Source"];
	    }
	}
	export class Settings {
	    region: string;
	    derpMapUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.region = source["region"];
	        this.derpMapUrl = source["derpMapUrl"];
	    }
	}

}

