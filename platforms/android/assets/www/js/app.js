"use strict";angular.module("app",["ionic","ui.router","uuid","ngStorage","app.pouch","app.tabs_controller","app.todos_controller","app.pouch_controller","app.todo"]).run(["$ionicPlatform",function($ionicPlatform){$ionicPlatform.ready(function(){window.cordova&&window.cordova.plugins.Keyboard&&cordova.plugins.Keyboard.hideKeyboardAccessoryBar(!0),window.StatusBar&&StatusBar.styleDefault()})}]).config(["$urlRouterProvider",function($urlRouterProvider){$urlRouterProvider.otherwise("/tabs/todos/index")}]);