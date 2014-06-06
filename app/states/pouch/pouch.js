'use strict';

angular.module('app.pouch', [])
    .service('Pouch', function($rootScope, $timeout, $interval,  $localStorage, rfc4122) {

        var service =  {
            // Databases
            db: new PouchDB("LocalDB"),
            remotedb: undefined,

            // Persistent Settings
            settings: {
                database: undefined,
                username: undefined,
                password: undefined,
                stayConnected: undefined
            },

            // Persistent Status
            status: {
                localChanges: 0,
                changeEvents: {},
                replicationToEvents: {},
                replicationFromEvents: {}
            },

            // Session Status
            session: {
                // Session Stats
                status: "offline",
                docsSent: 0,
                docsReceived: 0,
                currentRetryDelay: 10,
                maxRetryDelay: 60*1000*10,
                retryDelayInc: 1000,
                lastConnectionAttempt: undefined,
                publishInProgress: false
            },

            // SPromises & Even Emitters
            changes: undefined,
            replicationTo: undefined,
            replicationFrom: undefined,
            delayStatusPromise: undefined,
            retryPromise: undefined,
            publishPromise: undefined,

            /*
             *  Initializers
             *
             */

            init: function() {
                // Load Persistent Data
                this.loadSettings();
                this.loadStatus();

                // Start Session
                this.trackChanges();
                this.initRobustSync(1000);
            },


            /*
             *  $localStorage aware accessors for settings and status
             */

            incrementLocalChanges: function() {
                var self = this;
                if( typeof self.status.localChanges === "number")
                {
                    self.status.localChanges++;
                } else {
                    self.status.localChanges = 1;
                }


                this.persistStatus();
            },

            resetLocalChanges: function() {
                this.status.localChanges = 0;
                this.persistStatus();
            },

            storeChangeEvent: function(value, event) {
                var self = this;
                if( typeof self.status.changeEvents === "undefined")
                {
                    self.status.changeEvents = {}
                }
                self.status.changeEvents[event] = value;
                self.persistStatus();
            },

            storeReplicationToEvent: function(value, event) {
                var self = this;
                if( typeof self.status.replicationToEvents === "undefined")
                {
                    self.status.replicationToEvents = {}
                }

                self.status.replicationToEvents[event] = value;
                self.persistStatus();
            },

            storeReplicationFromEvent: function(value, event) {
                var self = this;
                if( typeof self.status.replicationFromEvents === "undefined")
                {
                    self.status.replicationFromEvents = {}
                }
                self.status.replicationFromEvents[event] = value;
                self.persistStatus();
            },

            persistStatus: function() {
                $localStorage.pouchStatus = this.status;
            },

            loadSettings: function() {
                if (typeof $localStorage.pouchSettings !== undefined) {
                    this.settings = $localStorage.pouchSettings
                }
            },

            loadStatus: function() {
                if (typeof $localStorage.pouchStatus !== undefined) {
                    this.status = $localStorage.pouchStatus
                }
            },

            /*
             *  Public Methods
             */

            getSettings: function() {
                return this.settings;
            },

            saveSettings: function(settings) {
                this.settings = settings;
                $localStorage.pouchSettings = settings;
                this.initRobustSync(1000);

            },

            localChanges: function() {
                if (typeof this.status === "undefined")
                {
                    return "undefined";
                } else
                {
                    return this.status.localChanges;
                }
            },

            attemptConnection: function() {
                var self = this;
                self.session.lastConnectionAttempt = new Date();
                self.flashSessionStatus("connecting");
                self.connect();
            },


            statusIcon: function() {
                switch(this.session.status) {
                    case "connecting":
                        return "ion-ios7-cloudy-night-outline"
                    case "online":
                        return "ion-ios7-cloud-outline";
                    case "offline":
                        return "ion-ios7-cloudy-night";
                    case "idle":
                        return "ion-ios7-cloud-outline";
                    case "receiving":
                        return "ion-ios7-cloud-download-outline";
                    case "sending":
                        return "ion-ios7-cloud-upload-outline";
                    default:
                        return "ion-alert-circled";
                }
            },

            statusTitle: function() {
                switch(this.session.status) {
                    case "online":
                        return "Connected";
                    case "connecting":
                        return "Trying to connect";
                    case "offline":
                        return "Not connected";
                    case "idle":
                        return "Connected";
                    case "receiving":
                        return "Receiving Data";
                    case "sending":
                        return "Sending Data";
                    default:
                        return "Unknown Status";
                }
            },

            // Destroy and recreated local db and changes db
            reset: function() {
                var self = this;
                var p1 = PouchDB.destroy("LocalDB").then( function() {
                    $localStorage.pouchStatus = {};
                    $localStorage.session = {};
                    self.disconnect();
                    self.init();
                });
            },

            /*
             *  Private Methods
             */


            initRobustSync: function(delay) {
                var self = this;
                console.log("initRobustSync");
                self.session.currentRetryDelay = delay;
                self.cancelProgressiveRetry();

                if (self.settings.stayConnected === true) {
                    self.progressiveRetry();
                }
            },

            maxOutProgressiveDelay: function() {
                this.initRobustSync(this.session.maxRetryDelay);
            },

            restartProgressiveDelay: function() {
                if (this.session.status !== "connecting" &&
                    this.session.status !== "offline")
                {
                    this.initRobustSync(1000);
                }
            },

            cancelProgressiveRetry: function() {
                var self = this;
                if (typeof self.retryPromise === "object") {
                    $interval.cancel(self.retryPromise);
                }
            },

            progressiveRetry: function() {
                var self = this;
                if (self.session.currentRetryDelay < self.session.maxRetryDelay)
                {
                    console.log("Progress Delay");
                    self.session.currentRetryDelay = self.session.currentRetryDelay + self.session.retryDelayInc;
                }

                self.retryPromise = $interval( function() {
                    self.progressiveRetry();
                    self.attemptConnection();
                    }, self.session.currentRetryDelay, 1, false)
            },

            flashSessionStatus: function(status) {
                var self = this;
                var s = self.session.status;
                self.setSessionStatus(status);
                self.delaySessionStatus(2000, s);
            },

            setSessionStatus: function(status) {
                var self = this;
                self.cancelSessionStatus();
                $timeout(function() {
                    self.session.status = status;
                })
            },

            delaySessionStatus: function(delay, status) {
                var self = this;
                self.cancelSessionStatus();
                self.delayStatusPromise= $timeout(
                    function() {
                          self.setSessionStatus(status);
                         },delay);
            },

            cancelSessionStatus: function() {
                console.log("Cancel Delay Status");
                var self = this;
                if (typeof self.delayStatusPromise === "object")
                {
                    console.log("Cancel Delay Status Occurred");
                    $timeout.cancel(self.delayStatusPromise);
                }
            },

            trackChanges: function() {
                console.log("track changes");
                var self = this;
                if (typeof self.changes === "object") {
                    self.changes.cancel();
                }
                self.db.info()
                    .then( function(info) {
                        self.changes = self.db.changes({
                            since: info.update_seq,
                            live: true
                        })
                            .on('change', function(info) {self.handleChanges(info, "change")} )
                            .on('error', function(info) {self.handleChanges(info, "error")})
                            .on('complete', function(info) {self.handleChanges(info, "complete")})
                });

            },

            handleChanges: function(info, event) {
                console.log("handleChanges");
                var self = this;
                info.occurred_at = new Date();
                self.storeChangeEvent(info, event);
                if (event === "change") {
                    self.incrementLocalChanges();
                    $rootScope.$apply();
                }

            },

            handleReplicationFrom: function(info, event) {
                console.log("handleReplicationFrom");
                var self = this;
                info.occurred_at = new Date();
                self.storeReplicationFromEvent(info, event);
                switch (event) {
                    case "uptodate":
                        self.maxOutProgressiveDelay();
                        self.delaySessionStatus(800, "idle");
                        break;
                    case "error":
                        self.restartProgressiveDelay();
                        self.delaySessionStatus(800, "offline");
                        break;
                    case "complete":
                        //self.restartProgressiveDelay();
                        //self.delaySessionStatus(800, "offline");
                        break;
                    case "change":
                        self.maxOutProgressiveDelay();
                        if(info.docs_written > self.session.docsReceived){
                            self.session.docsReceived = info.docs_written;
                            self.setSessionStatus("receiving");
                        }
                        break
                    }
                $rootScope.$apply();
            },

            handleReplicationTo: function(info, event) {
                console.log("handleReplicationTo");
                var self = this;
                switch (event) {
                    case "uptodate":
                        self.maxOutProgressiveDelay();
                        self.resetLocalChanges();
                        self.delaySessionStatus(800, "idle");
                        break;
                    case "error":
                        self.restartProgressiveDelay();
                        self.delaySessionStatus(800, "offline");
                        break;
                    case "complete":
                        //self.restartProgressiveDelay();
                        //self.delaySessionStatus(800, "offline");
                        break;
                    case "change":
                        self.maxOutProgressiveDelay();
                        if(info.docs_written > self.session.docsSent){
                            self.session.docsSent = info.docs_written;
                            self.setSessionStatus("sending");
                        }
                        break
                }
                info.occurred_at = new Date();
                this.storeReplicationToEvent(info, event);
                $rootScope.$apply();
            },


            // Disconnect from Remote Database
            disconnect: function() {
                var self = this;
                if(typeof self.replicationTo === "object") {
                    self.replicationTo.cancel();
                }

                if(typeof self.replicationFrom === "object") {
                        self.replicationFrom.cancel();
                }
            },

            createRemoteDb: function() {
                var self = this;
                if (typeof self.settings.database === "string")
                {
                    self.remotedb = new PouchDB(this.settings.database);
                }
            },



            // Connect to Remote Database and Start Replication
            connect: function() {
                var self = this;
                self.session.docsSent = 0;
                self.session.docsReceived = 0;
                self.disconnect();
                self.createRemoteDb();
                self.session.replicationTo = self.db.replicate.to(self.remotedb, {live: true})
                    .on('change', function(info)   {self.handleReplicationTo(info, "change")})
                    .on('uptodate', function(info) {self.handleReplicationTo(info, "uptodate")})
                    .on('error', function(info)    {self.handleReplicationTo(info, "error")})
                    .on('complete', function(info) {self.handleReplicationTo(info, "complete")});

                self.session.replicationFrom = self.db.replicate.from(self.remotedb, {live: true})
                    .on('change', function(info)   {self.handleReplicationFrom(info, "change")})
                    .on('uptodate', function(info) {self.handleReplicationFrom(info, "uptodate")})
                    .on('error', function(info)    {self.handleReplicationFrom(info, "error")})
                    .on('complete', function(info) {self.handleReplicationFrom(info, "complete")});
            },


            // Test if connection is still working
            isConnected: function() {
                var self = this;
                if (typeof self.replicationTo === "undefined") {
                    return false;
                }
                if (typeof self.replicationFrom === "undefined") {
                    return false;
                }
                if (self.replicationTo.cancelled) {
                    return false;
                }
                if (self.replicationFrom.cancelled) {
                    return false;
                }
                return true;
            }
        };

        service.init();
        return service
    });

