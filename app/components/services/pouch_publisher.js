'use strict';

angular.module('app.pouch_publisher', [])
    .service('PouchPublisher', function(Pouch) {
        return {

            cancel: function() {
                if(this.changes != undefined) {
                    if(this.changes.cancel != undefined)
                    {
                        this.changes.cancel();
                    }
                }
            },

            use: function(f) {
                // Cancel previous change watchers
                // Run the function immediately and on database change
                var controlHelper = this;
                f();
                Pouch.db.info(function(err, info) {
                    controlHelper.cancel();
                    controlHelper.changes = Pouch.db.changes({
                        since: info.update_seq,
                        live: true
                    }).on('change', f);
                });
            },

        }
    });
