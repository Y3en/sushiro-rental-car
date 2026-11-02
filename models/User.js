const mongoose=require('mongoose');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');

const UserSchema=new mongoose.Schema({
    name:{
        type:String,
        required:[true,'Please add a name']
    },
    tel:{
        type:String,
        required:[true,'Please add a telephone number']
    },
    email:{
        type: String,
        required:[true,'Please add an email'],
        unique: true,
        match: [
            /^(([^<>()[\]\.,;:\s@"]+(\.[^<>()[\]\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
            'Please add a valid email'
        ]
    },
    role: {
        type:String,
        enum: ['user','admin'],
        default: 'user'
    },
    password: {
        type:String,
        required:[true,'Please add a password'],
        minlength: 6,
        select: false
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    bookingLock: { type: Number, default: 0, select: false },
    tokenVersion: { type: Number, default: 0 },
    createdAt:{
        type: Date,
        default:Date.now
    }
});

UserSchema.pre('save',async function() {
    //Only rehash when the password was set or changed
    if(!this.isModified('password')) return;
    const salt=await bcrypt.genSalt(10);
    this.password=await bcrypt.hash(this.password, salt);
});

UserSchema.methods.getSignedJwtToken=function(){
    return jwt.sign({id:this._id, version:this.tokenVersion},process.env.JWT_SECRET,{
        expiresIn: process.env.JWT_EXPIRE
    });
}

UserSchema.methods.matchPassword=async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
}

module.exports = mongoose.model('User',UserSchema);
