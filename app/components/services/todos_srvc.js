'use strict';

angular.module('app.todos_srvc', [])
    .factory('todosService', function(db, rfc4122) {

        return {
            add: function(obj) {
                obj._id = 'todo_'+rfc4122.v4();
                obj.doc_type = 'todo';
                obj.created_at = new Date();
                return db.put(obj);
            },
            all: function() {
                var allTodos = function(doc) {
                    if (doc.doc_type === 'todo') {
                        emit(doc.created_at, doc._id);
                    }
                }
                return db.query(allTodos, {descending: true, include_docs : true});
            }
        };
    });