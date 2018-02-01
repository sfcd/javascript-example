import {Component, Inject, Input} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';

import {ErrorHandlingService} from '@capServices/errorHandlingService';
import {UserService} from '@capServices/userService';
import {ToastService} from "../../../../services/toastService";

import {template} from './error.handling.component.pug';
import {style} from './error.handling.component.scss';

import {ERRORS_DICTIONARY, MODAL_TYPE, MESSAGES, ROLE_ENUM} from '@capUtils/constants';
import {TOAST_TYPE} from "../toast.component/toast.component";
import isObject from 'lodash/isObject';
import isArray from 'lodash/isArray';

const CONTACT_EMPLOYER_MSG = " Please contact your employer %email%";

let employerEmail;

@Component({
    selector: 'cap-error-handling',
    template,
    styles: [style]
})
export class ErrorHandlingComponent {

    constructor(@Inject(ErrorHandlingService) errorSvc,
                @Inject(UserService) userSvc,
                @Inject(ActivatedRoute) route,
                @Inject(Router) router,
                @Inject(ToastService) toastSvc) {
        this.toastSvc = toastSvc;
        this.router = router;
        this.route = route;
        this.errorSvc = errorSvc;
        this.userSvc = userSvc;
        ErrorHandlingComponent._errorSvc = errorSvc;
        this.modalOpen = false;
        this.showToast = false;
        this.modalType = {
            error: MODAL_TYPE.ERROR,
            confirm: MODAL_TYPE.CONFIRM
        };


        this.userSubscription = this.userSvc.currentUser
            .subscribe(user => {
                if (!user) {
                    return;
                }
                this.currentUser = user;
                if (user.company)
                    employerEmail =user.company.email;
            });
    }

    ngOnInit() {
        this.errorSubscription = this.errorSvc.errResponse$
            .subscribe(response => {
                if (isObject(response)) {
                    this.handleResponse(response);
                } else {
                    this.toastSvc.emitMessage({text: MESSAGES.PERMISSION_ERROR}, TOAST_TYPE.ERROR);
                }
            });
        if (this.errorSvc.showAccessMessage) {
            this.toastSvc.emitMessage({text: MESSAGES.PERMISSION_ERROR}, TOAST_TYPE.ERROR);
            this.errorSvc.showAccessMessage = false;
        }

    }


    closeModal() {
        this.modalOpen = false;
    }

    handleResponse(response) {
        this.errorCode = response.status;
        if (this.errorCode === 401) {
            this.userSvc.removeAutorizationHeader();
            this.router.navigate(['/']);
            return;
        }
        if (this.errorCode === 404) {
            console.log('Not Found');
            return;
        }
        if (this.errorCode !== 500) {
            this.message = getErrorMessage(response.json(), this.currentUser);
            this.message.forEach(el => {
                if (el.route){
                    el.action  = () => this.router.navigate(el.route);
                }
                this.toastSvc.emitMessage(el, el.type? el.type: TOAST_TYPE.ERROR);
            });

        }
        if (this.errorCode === 500) {
            this.modalOpen = true;
        }
    }


    ngOnDestroy() {
        this.errorSubscription.unsubscribe();
    }
}

export function getErrorMessage(response, user = null) {
    let message = [];
    let res = response;
    for (let key in res) {
        if (isArray(res[key])){
            res[key].map(i => {
                if (i.hasOwnProperty('message')) {
                    message.push({text:ERRORS_DICTIONARY[`${key}_${i.code}`] || i.message + ' '});
                    if (i.code === "incomplete_profile"){
                        let msg = {};
                        if (user && user.role === ROLE_ENUM.EMPLOYEE){
                            msg.text = CONTACT_EMPLOYER_MSG.replace("%email%", employerEmail);
                        } else {
                            msg = {text: MESSAGES.NO_PROFILE, link: 'Here', route: ['/', 'employer', 'preferences', 'profile'],type: TOAST_TYPE.ATTENTION};
                        }
                        message.push(msg);
                    }
                } else if (i.hasOwnProperty('__all__') && isArray(i['__all__'])) {
                    i['__all__'].map(i => {
                        if (i.hasOwnProperty('message')) {
                            message.push({text:`${i.message} `});
                            if (i.code === "incomplete_profile"){
                                let msg = {};
                                if (user && user.role === ROLE_ENUM.EMPLOYEE){
                                    msg.text = CONTACT_EMPLOYER_MSG.replace("%email%", employerEmail);
                                } else {
                                    msg = {text: MESSAGES.NO_PROFILE, link: 'Here', route: ['/', 'employer', 'preferences', 'profile'],type: TOAST_TYPE.ATTENTION};
                                }
                                message.push(msg);
                            }
                        }
                    });
                } else {
                    message.push({text: `${getErrorMessage(i)}`});
                }
            });
        }else if (isObject(res[key])){
            message.push({text: `${getErrorMessage(i)}`});
        }
    }
    if (message.length === 0) {
        message.push({text:'Unknown error'});
    }
    return message;
}

export function ErrorHandling(showError = true) {
    return function (target, key, descriptor) {
        let f = descriptor.value;
        descriptor.value = function (...args) {
            return f.call(this, ...args)
                .catch(err => {
                    if (showError) {
                        return ErrorHandlingComponent._errorSvc.emitErrResponse(err);
                    }
                    return Promise.reject(err);
                });
        };
        return descriptor;
    }
}

