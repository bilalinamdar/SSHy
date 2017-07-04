SSHyClient.auth = function(parceler) {
    this.parceler = parceler; // We shouldn't need anything from the transport handler
    this.authenticated = null;
    this.awaitingAuthentication = false;
	this.hostname = wsproxyURL ? wsproxyURL.split('/')[2].split(':')[0] : '';
	this.termUsername = '';
	this.termPassword = undefined;
	this.failedAttempts = 0;
};

SSHyClient.auth.prototype = {
    // Requests we want to authenticate ourselves with the SSH server
    request_auth: function() {
        var m = new SSHyClient.Message();
        m.add_bytes(String.fromCharCode(SSHyClient.MSG_SERVICE_REQUEST));
        m.add_string('ssh-userauth');
        this.parceler.send(m);
    },
    // Sends the username and password provided by index.html
    ssh_connection: function() {
		if(!this.termUsername || !this.termPassword){
			// If no termUser or termPass has been set then we are likely using the wrapper
            startxtermjs();
			return;
		}

       var m = new SSHyClient.Message();
       m.add_bytes(String.fromCharCode(SSHyClient.MSG_USERAUTH_REQUEST));
       m.add_string(this.termUsername);
       m.add_string("ssh-connection");
       m.add_string("password");
       m.add_boolean(false);
       m.add_string(this.termPassword);

	   // Purge the username and password
	   this.termUsername = '';
	   this.termPassword = undefined;

       this.parceler.send(m);
       this.awaitingAuthentication = true;
	},
    // Called on successful or partially successful SSH connection authentications
    auth_success: function(success) {
        if (success) {
            // Change the window title
            document.title = this.termUsername + '@' + this.hostname;
			// Make sure xtermjs has been initialised
			if(!term){
				startxtermjs();
			}
            // We've been authenticated, lets open a channel
            this.open_channel('session');
        }
        // TODO: implement follow on tries for authentication (keyboard/public key)
    },
    // Opens a channel - generally called right after authenticating with the SSH server
    open_channel: function(type, onsuccess) {
        onsuccess = onsuccess === undefined ? null : onsuccess;
        var m = new SSHyClient.Message();
        m.add_bytes(String.fromCharCode(SSHyClient.MSG_CHANNEL_OPEN));
        m.add_string(type);
        m.add_int(1);
        m.add_int(SSHyClient.WINDOW_SIZE);
        m.add_int(SSHyClient.MAX_PACKET_SIZE);

        this.parceler.send(m);
    },
    // Requests a pseudo-terminal, defaulting to xterm if no other terminal emulator is provided
    get_pty: function(term, width, height) {
        var m = new SSHyClient.Message();
        m.add_bytes(String.fromCharCode(SSHyClient.MSG_CHANNEL_REQUEST));
        m.add_int(0);
        m.add_string('pty-req');
        m.add_boolean(false); // we don't want any enviroment vars to be returned
        m.add_string(term);
        m.add_int(width);
        m.add_int(height);
        // pixel data, which is overwritten by the above height and width
        m.add_int(0);
		m.add_int(0);
        // not going to use any special terminal modes currently
        m.add_string('');

        this.parceler.send(m);
        // invokes the shell session right after sending the packet
        this.invoke_shell();
    },
    // called by window.resize on index.html - resizes the terminal window on the SSH server
    // useful for screen sharing applications such as tmux or screen
    resize_pty: function(width, height) {
        var m = new SSHyClient.Message();
        m.add_bytes(String.fromCharCode(SSHyClient.MSG_CHANNEL_REQUEST));
        m.add_int(0);
        m.add_string('window-change');
        m.add_boolean(false);
        m.add_int(width);
        m.add_int(height);
        m.add_int(0);
		m.add_int(0);
        this.parceler.send(m);
    },
    // Invokes the interactive terminal using the pseudo-terminal channel
    invoke_shell: function() {
        // Craft the shell invocation packet
        var m = new SSHyClient.Message();
        m.add_bytes(String.fromCharCode(SSHyClient.MSG_CHANNEL_REQUEST));
        m.add_int(0);
        m.add_string('shell');
        m.add_boolean(false);

        this.parceler.send(m);
        // Start xterm.js
        if (this.termPassword === undefined) {
            term.write('\n\r');
            return;
        }
        startxtermjs();
    },
	// Called on unsuccessful SSH connection authentication
	authFailure: function() {
		if(term){
		    term.write("Access Denied\r\n");
			// if we've failed authentication more than 5 times than disconect and warn the user
		    if (++this.failedAttempts >= 5) {
		        term.write("Too many failed authentication attempts");
		        transport.disconnect();
		        return;
		    }
		    term.write(this.termUsername + '@' + this.hostname + '\'s password:');
		    this.termPassword = '';
		} else {
			display_error('Invalid Username or Password');
		}
	}
};
