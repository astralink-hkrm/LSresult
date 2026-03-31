import { Schema, model, models } from 'mongoose';

const RajasthanResultSchema = new Schema({
  rollNo: { type: String, required: true, unique: true },
  stream: { type: String, enum: ['science', 'arts'], required: true },
  candidateName: { type: String },
  fatherName: { type: String },
  motherName: { type: String },
  schoolName: { type: String },
  subjects: [{
    name: { type: String },
    total: { type: String }
  }],
  totalMarks: { type: String },
  resultDivision: { type: String },
  percentage: { type: String },
  mobile: { type: String },
  fetchedAt: { type: Date, default: Date.now }
});

const RajasthanResult = models.RajasthanResult || model('RajasthanResult', RajasthanResultSchema);

export default RajasthanResult;
